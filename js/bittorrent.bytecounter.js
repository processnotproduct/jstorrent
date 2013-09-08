(function() {

    function isInteger(v) {
        return typeof v == 'number' && v.toString().indexOf('.') == -1;
    }

    jstorrent.ByteCounter = function(opts) {
        // stores "samples" buckets of size "interval" in a ring buffer

        /*
          |---|---|---|---|---|---|
           ss       s           s

               |
              cpos

        */
        this.numsamples = opts.samples || 10;
        this.sampsize = opts.sampsize || 1;
        this.parent = opts.parent;
        this.nodate = opts.nodate;
        this.totalbytes = 0;
        this.cbuf = [];
        this.cpos = 0;
        this.last_sample = null;
        for (i=0;i<this.numsamples;i++){ this.cbuf.push(0); }
        
    }
    jstorrent.ByteCounter.prototype = {
        set_parent: function(parent) {
            this.parent = parent;
        },
        sample: function(bytes, t, s, opts) {
            //console.log('sample bytes',bytes)
            //if (! (opts && opts.internal) && bytes == 0) { debugger }
            this.totalbytes += bytes;
            // takes a sample at time t of some bytes
            if (this.nodate && t === undefined) {
                assert(false);
            } else {
                t = t || new Date();
            }
            var s = s || Math.floor(t/1000);
            if (this.last_sample !== null) {
                var time_elapsed = s - this.last_sample;
                var buckets_elapsed = time_elapsed / this.sampsize;
/*
                assert( buckets_elapsed < Math.pow(2,8), { throw: true } ) // bug !!
                assert( isInteger(time_elapsed), {throw:true} );
                assert( isInteger(buckets_elapsed), {throw:true} );
*/

                var maxiter = Math.min( this.numsamples, buckets_elapsed-1 );
                //assert(maxiter > 0);
                for (var i=0; i<maxiter; i++) {
                    var zeroat = (this.cpos+1+i)%this.numsamples;
                    this.cbuf[zeroat] = 0;
                }
                this.cpos = (this.cpos + buckets_elapsed) % this.numsamples;
                this.cbuf[(this.cpos+1)%this.numsamples] = 0; // clear out the next thing!
                this.cbuf[this.cpos] += bytes;
            } else {
                var buckets_elapsed = 0;
                this.cbuf[this.cpos] += bytes;
            }

            this.last_sample = s;
            if (this.parent) {
                if (opts && opts.noparent) {
                } else {
                    this.parent.sample(bytes, t, s, opts);
                }
            }
        },
        total: function() {
            return this.totalbytes;
        },
        recent: function(t, s, opts) {
            //if (! opts) { opts = {} }
            //opts.internal = true
            this.sample(0, t, s, opts);
            var sum = 0;
            assert( isInteger(this.numsamples), {throw:true} );

            for (var i=0; i<this.numsamples; i++) {
                sum += this.cbuf[(this.cpos + 1 + i)%this.numsamples];
            }
            return sum;
        },
        avg: function(opts) {
            // TODO -- take into account first sample (cant average unless connection is at least numsamples*sampsize old)
            var sum = this.recent(undefined, undefined, opts);
            //if (this._expect_nonzero && sum == 0) { debugger; }
            return sum/(this.numsamples * this.sampsize);
        }

    }


    function arrayEq(a,b) {
        if (a.length == b.length) {
            for (var i=0; i<a.length; i++) {
                if (a[i] != b[i]) {
                    return false
                }
            }
            return true;
        }
        return false;
    }



    if (config.unit_tests || true) {
        var bc = new jstorrent.ByteCounter({samples:4, nodate:true});
        bc.sample(1, 1000);
        assert(arrayEq(bc.cbuf, [1,0,0,0]));
        assert(bc.recent(1000) == 1);

        bc.sample(1, 1000);
        assert(arrayEq(bc.cbuf, [2,0,0,0]));
        assert(bc.recent(1000) == 2);
        bc.sample(1, 2000);
        assert(arrayEq(bc.cbuf, [2,1,0,0]));
        assert(bc.recent(2000) == 3);
        bc.sample(1, 2000);
        assert(arrayEq(bc.cbuf, [2,2,0,0]));
        bc.sample(3, 4000);
        assert(arrayEq(bc.cbuf, [0,2,0,3]));
        bc.sample(1, 4000);
        assert(arrayEq(bc.cbuf, [0,2,0,4]));
        bc.sample(7, 5000);
        assert(arrayEq(bc.cbuf, [7,0,0,4]));
        assert(bc.recent(5000) == 11);

        bc = new jstorrent.ByteCounter({samples:6, nodate:true});
        bc.sample(1, 1);
        assert(arrayEq(bc.cbuf, [1,0,0,0,0,0]));
        bc.sample(2, 1);
        assert(arrayEq(bc.cbuf, [3,0,0,0,0,0]));
        
    }

})();
