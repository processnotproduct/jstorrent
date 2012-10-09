'use strict';

var SparseBytestream = (function BytestreamClosure() {
    function constructor(sparsefile, start, length) {
        this.sparsefile = sparsefile;
        this.start = start || 0;
        this.pos = this.start;
        this.EOF = -1;
        //this.end = (start + length) || this.bytes.length;
        this.end = (start + length)
    }
    constructor.prototype = {
        get length() {
            return this.end - this.start;
        },
        get position() {
            return this.pos;
        },
        get remaining() {
            return this.end - this.pos;
        },
        getBytes: function(length) {
            //self.postMessage('read '+length);
            if (length > Math.pow(2,10)) { debugger; }
            if (this.end == this.pos) {
                return this.EOF;
            }

            var contained = false;
            for (var i=0; i<this.sparsefile.length; i++) {
                if (this.pos >= this.sparsefile[i][0]) {
                    if (this.pos + length < this.sparsefile[i][0] + this.sparsefile[i][1].length) {
                        contained = i;
                        break;
                    }
                }
            }

            if (contained === false) {
                return {error:'no data'};
            } else {
                var readin = this.pos - this.sparsefile[contained][0]
                var data = new Uint8Array( this.sparsefile[contained][1].buffer.slice( readin, readin+length ) );
                assert(data.length == length);
                return data
            }

            //return new Uint8Array(this.reader.readAsArrayBuffer( this.file.slice( this.pos, this.pos + length ) ));
        },
        advance: function(length) {
            this.pos += length;
        },
        readU8Array: function (length) {
            if (length > Math.pow(2,20)) { debugger; }

            if (this.pos > this.end - length)
                return null;
            var res = this.getBytes(length);
            //var res = this.bytes.subarray(this.pos, this.pos + length);
            this.pos += length;
            return res;
        },
        readU32Array: function (rows, cols, names) {
            cols = cols || 1;
            if (this.pos > this.end - (rows * cols) * 4)
                return null;
            if (cols == 1) {
                var array = new Uint32Array(rows);
                for (var i = 0; i < rows; i++) {
                    array[i] = this.readU32();
                }
                return array;
            } else {
                var array = new Array(rows);
                for (var i = 0; i < rows; i++) {
                    var row = null;
                    if (names) {
                        row = {};
                        for (var j = 0; j < cols; j++) {
                            row[names[j]] = this.readU32();
                        }
                    } else {
                        row = new Uint32Array(cols);
                        for (var j = 0; j < cols; j++) {
                            row[j] = this.readU32();
                        }
                    }
                    array[i] = row;
                }
                return array;
            }
        },
        read8: function () {
            return this.readU8() << 24 >> 24;
        },
        readU8: function () {
            if (this.pos >= this.end)
                return null;
            var val = this.getBytes(1)[0]
            this.pos++;
            return val;
            //return this.bytes[this.pos++];
        },
        read16: function () {
            return this.readU16() << 16 >> 16;
        },
        readU64: function () {
            if (this.pos >= this.end - 1)
                return null;
            var bytes = this.getBytes(8);
            var res = bytes[0] << 56 | bytes[1] << 48 | bytes[2] << 40 | bytes[3] << 32 | bytes[4] << 24 | bytes[5] << 16 | bytes[6] << 8 | bytes[7];
            //var res = this.bytes[this.pos + 0] << 8 | this.bytes[this.pos + 1];
            this.pos += 8;
            return res;
        },
        readU16: function () {
            if (this.pos >= this.end - 1)
                return null;
            var data = this.getBytes(2);
            var res = data[0] << 8 | data[1];
            //var res = this.bytes[this.pos + 0] << 8 | this.bytes[this.pos + 1];
            this.pos += 2;
            return res;
        },
        read24: function () {
            return this.readU24() << 8 >> 8;
        },
        readU24: function () {
            var pos = this.pos;
            //var bytes = this.bytes;
            if (pos > this.end - 3)
                return null;
            var bytes = this.getBytes(3);
            //var res = bytes[pos + 0] << 16 | bytes[pos + 1] << 8 | bytes[pos + 2];
            var res = bytes[0] << 16 | bytes[1] << 8 | bytes[2];
            this.pos += 3;
            return res;
        },
        peek32: function (advance) {
            var pos = this.pos;
            //var bytes = this.bytes;
            var bytes = this.getBytes(4);
            if (bytes && bytes.error) { return bytes; }
            if (bytes == this.EOF) { return this.EOF; }
            if (pos > this.end - 4)
                return null;
            //var res = bytes[pos + 0] << 24 | bytes[pos + 1] << 16 | bytes[pos + 2] << 8 | bytes[pos + 3];
            var res = bytes[0] << 24 | bytes[1] << 16 | bytes[2] << 8 | bytes[3];
            if (advance) {
                this.pos += 4;
            }
            return res;
        },
        read32: function () {
            return this.peek32(true);
        },
        readU32: function () {
            return this.peek32(true) >>> 0;
        },
        read4CC: function () {
            var pos = this.pos;
            if (pos > this.end - 4)
                return null;
            var res = "";
            var bytes = this.getBytes(4);
            for (var i = 0; i < 4; i++) {
                //res += String.fromCharCode(this.bytes[pos + i]);
                res += String.fromCharCode(bytes[i]);
            }
            this.pos += 4;
            return res;
        },
        readFP16: function () {
            return this.read32() / 65536;
        },
        readFP8: function () {
            return this.read16() / 256;
        },
        readISO639: function () {
            var bits = this.readU16();
            var res = "";
            for (var i = 0; i < 3; i++) {
                var c = (bits >>> (2 - i) * 5) & 0x1f;
                res += String.fromCharCode(c + 0x60);
            }
            return res;
        },
        readUTF8: function (length) {
            var res = "";
            for (var i = 0; i < length; i++) {
                res += String.fromCharCode(this.readU8());
            }
            return res;
        },
        readPString: function (max) {
            var len = this.readU8();
            assert (len <= max);
            var res = this.readUTF8(len);
            this.reserved(max - len - 1, 0);
            return res;
        },
        skip: function (length) {
            this.seek(this.pos + length);
        },
        reserved: function (length, value) {
            for (var i = 0; i < length; i++) {
                assert (this.readU8() == value);
            }
        },
        seek: function (index) {
            if (index < 0 || index > this.end) {
                error("Index out of bounds (bounds: [0, " + this.end + "], index: " + index + ").");
            }
            this.pos = index;
        },
        subStream: function (start, length) {
            //return new Bytestream(this.bytes.buffer, start, length);
            return new SparseBytestream(this.sparsefile, start, length);
        }
    };
    return constructor;
})();

var PARANOID = true; // Heavy-weight assertions.

/**
 * Reads an mp4 file and constructs a object graph that corresponds to the box/atom
 * structure of the file. Mp4 files are based on the ISO Base Media format, which in
 * turn is based on the Apple Quicktime format. The Quicktime spec is available at:
 * http://developer.apple.com/library/mac/#documentation/QuickTime/QTFF. An mp4 spec
 * also exists, but I cannot find it freely available.
 *
 * Mp4 files contain a tree of boxes (or atoms in Quicktime). The general structure
 * is as follows (in a pseudo regex syntax):
 *
 * Box / Atom Structure:
 *
 * [size type [version flags] field* box*]
 *  <32> <4C>  <--8--> <24->  <-?->  <?>
 *  <------------- box size ------------>
 *
 *  The box size indicates the entire size of the box and its children, we can use it
 *  to skip over boxes that are of no interest. Each box has a type indicated by a
 *  four character code (4C), this describes how the box should be parsed and is also
 *  used as an object key name in the resulting box tree. For example, the expression:
 *  "moov.trak[0].mdia.minf" can be used to access individual boxes in the tree based
 *  on their 4C name. If two or more boxes with the same 4C name exist in a box, then
 *  an array is built with that name.
 *
 */
var MP4Reader = (function reader() {
    var BOX_HEADER_SIZE = 8;
    var FULL_BOX_HEADER_SIZE = BOX_HEADER_SIZE + 4;

    function constructor(stream) {
        this.stream = stream;
        this.tracks = {};
        this.EOF = -1;
    }

    constructor.prototype = {
        getTotalTimeInSeconds: function() {
            var maxtime = 0;
            _.each(this.tracks, function(track) {
                maxtime = Math.max(maxtime, track.getTotalTimeInSeconds());
            });
            return maxtime;
        },

        getFileBytesForTimeInSeconds: function(s) {
            var chunks = [];
            _.each( this.tracks, function(track) {
                chunks.push(track.secondsToChunkIncludingEdits(s));
            });
            return [ Math.min.apply(Math, chunks), Math.max.apply(Math,chunks) ];
        },

        readBoxes: function (stream, parent) {
            while (true) {
                var res = stream.peek32()
                if (! res) {
                    // cant read no moar
                    break;
                } else if (res == this.EOF) {
                    // parent['EOF'] = true;
                    break;
                } else if (res && res.error) {
                    parent['error'] = true;
                    parent['error_pos'] = stream.pos;
                    parent['error_msg'] = res.error;
                    break;
                }
                var child = this.readBox(stream);
                if (child.type in parent) {
                    var old = parent[child.type];
                    if (!(old instanceof Array)) {
                        parent[child.type] = [old];
                    }
                    parent[child.type].push(child);
                } else {
                    parent[child.type] = child;
                }
            }
        },
        readBox: function readBox(stream) {
            var box = { offset: stream.position };

            function readHeader() {
                box.size = stream.readU32();
                box.type = stream.read4CC();
                if (box.size == 1) {
                    box.size = stream.readU64();
                    box.is64 = true;
                }
            }

            function readFullHeader() {
                box.version = stream.readU8();
                box.flags = stream.readU24();
            }

            function remainingBytes() {
                return box.size - (stream.position - box.offset);
            }

            function skipRemainingBytes () {
                stream.skip(remainingBytes());
            }

            var readRemainingBoxes = function () {
                var subStream = stream.subStream(stream.position, remainingBytes());
                this.readBoxes(subStream, box);
                stream.skip(subStream.length);
            }.bind(this);

            readHeader();

            switch (box.type) {
            case 'ftyp':
                box.name = "File Type Box";
                box.majorBrand = stream.read4CC();
                box.minorVersion = stream.readU32();
                box.compatibleBrands = new Array((box.size - 16) / 4);
                for (var i = 0; i < box.compatibleBrands.length; i++) {
                    box.compatibleBrands[i] = stream.read4CC();
                }
                break;
            case 'moov':
                box.name = "Movie Box";
                readRemainingBoxes();
                break;
            case 'mvhd':
                box.name = "Movie Header Box";
                readFullHeader();
                assert (box.version == 0);
                box.creationTime = stream.readU32();
                box.modificationTime = stream.readU32();
                box.timeScale = stream.readU32();
                box.duration = stream.readU32();
                box.rate = stream.readFP16();
                box.volume = stream.readFP8();
                stream.skip(10);
                box.matrix = stream.readU32Array(9);
                stream.skip(6 * 4);
                box.nextTrackId = stream.readU32();
                break;
            case 'trak':
                box.name = "Track Box";
                readRemainingBoxes();
                this.tracks[box.tkhd.trackId] = new MP4Track(this, box);
                break;
            case 'tkhd':
                box.name = "Track Header Box";
                readFullHeader();
                assert (box.version == 0);
                box.creationTime = stream.readU32();
                box.modificationTime = stream.readU32();
                box.trackId = stream.readU32();
                stream.skip(4);
                box.duration = stream.readU32();
                stream.skip(8);
                box.layer = stream.readU16();
                box.alternateGroup = stream.readU16();
                box.volume = stream.readFP8();
                stream.skip(2);
                box.matrix = stream.readU32Array(9);
                box.width = stream.readFP16();
                box.height = stream.readFP16();
                break;
            case 'edts':
                box.name = "Edits"
                readRemainingBoxes();
                break;
            case 'elst':
                box.name = "Edit List";
                readFullHeader();
                box.entries = stream.readU32();
                box.table = [];
                //var table = stream.readU8Array(remainingBytes());
                for (var i=0; i<box.entries; i++) {
                    box.table.push( { duration: stream.readU32(),
                                      time: stream.read32(),
                                      rate: stream.readFP16() } );
                }
                break;
            case 'mdia':
                box.name = "Media Box";
                readRemainingBoxes();
                break;
            case 'mdhd':
                box.name = "Media Header Box";
                readFullHeader();
                assert (box.version == 0);
                box.creationTime = stream.readU32();
                box.modificationTime = stream.readU32();
                box.timeScale = stream.readU32();
                box.duration = stream.readU32();
                box.language = stream.readISO639();
                stream.skip(2);
                break;
            case 'hdlr':
                box.name = "Handler Reference Box";
                readFullHeader();
                stream.skip(4);
                box.handlerType = stream.read4CC();
                stream.skip(4 * 3);
                var bytesLeft = box.size - 32;
                if (bytesLeft > 0) {
                    box.name = stream.readUTF8(bytesLeft);
                }
                break;
            case 'minf':
                box.name = "Media Information Box";
                readRemainingBoxes();
                break;
            case 'stbl':
                box.name = "Sample Table Box";
                readRemainingBoxes();
                break;
            case 'stsd':
                box.name = "Sample Description Box";
                readFullHeader();
                box.sd = [];
                box.entries = stream.readU32();
                readRemainingBoxes();
                break;
            case 'avc1':
                stream.reserved(6, 0);
                box.dataReferenceIndex = stream.readU16();
                assert (stream.readU16() == 0); // Version
                assert (stream.readU16() == 0); // Revision Level
                stream.readU32(); // Vendor
                stream.readU32(); // Temporal Quality
                stream.readU32(); // Spatial Quality
                box.width = stream.readU16();
                box.height = stream.readU16();
                box.horizontalResolution = stream.readFP16();
                box.verticalResolution = stream.readFP16();
                assert (stream.readU32() == 0); // Reserved
                box.frameCount = stream.readU16();
                box.compressorName = stream.readPString(32);
                box.depth = stream.readU16();
                assert (stream.readU16() == 0xFFFF); // Color Table Id
                readRemainingBoxes();
                break;
            case 'mp4a':
                stream.reserved(6, 0);
                box.dataReferenceIndex = stream.readU16();
                box.version = stream.readU16();
                stream.skip(2);
                stream.skip(4);
                box.channelCount = stream.readU16();
                box.sampleSize = stream.readU16();
                box.compressionId = stream.readU16();
                box.packetSize = stream.readU16();
                box.sampleRate = stream.readU32() >>> 16;

                // TODO: Parse other version levels.
                assert (box.version == 0);
                readRemainingBoxes();
                break;
            case 'esds':
                box.name = "Elementary Stream Descriptor";
                readFullHeader();
                // TODO: Do we really need to parse this?
                skipRemainingBytes();
                break;
            case 'avcC':
                box.name = "AVC Configuration Box";
                box.configurationVersion = stream.readU8();
                box.avcProfileIndicaation = stream.readU8();
                box.profileCompatibility = stream.readU8();
                box.avcLevelIndication = stream.readU8();
                box.lengthSizeMinusOne = stream.readU8() & 3;
                assert (box.lengthSizeMinusOne == 3, "TODO");
                var count = stream.readU8() & 31;
                box.sps = [];
                for (var i = 0; i < count; i++) {
                    box.sps.push(stream.readU8Array(stream.readU16()));
                }
                var count = stream.readU8() & 31;
                box.pps = [];
                for (var i = 0; i < count; i++) {
                    box.pps.push(stream.readU8Array(stream.readU16()));
                }
                skipRemainingBytes();
                break;
            case 'btrt':
                box.name = "Bit Rate Box";
                box.bufferSizeDb = stream.readU32();
                box.maxBitrate = stream.readU32();
                box.avgBitrate = stream.readU32();
                break;
            case 'stts':
                box.name = "Decoding Time to Sample Box";
                readFullHeader();
                box.table = stream.readU32Array(stream.readU32(), 2, ["count", "delta"]);
                break;
            case 'stss':
                box.name = "Sync Sample Box";
                readFullHeader();
                box.samples = stream.readU32Array(stream.readU32());
                break;
            case 'stsc':
                box.name = "Sample to Chunk Box";
                readFullHeader();
                box.table = stream.readU32Array(stream.readU32(), 3,
                                                ["firstChunk", "samplesPerChunk", "sampleDescriptionId"]);
                break;
            case 'stsz':
                box.name = "Sample Size Box";
                readFullHeader();
                box.sampleSize = stream.readU32();
                var count = stream.readU32();
                if (box.sampleSize == 0) {
                    box.table = stream.readU32Array(count);
                }
                break;
            case 'stco':
                box.name = "Chunk Offset Box";
                readFullHeader();
                box.table = stream.readU32Array(stream.readU32());
                break;
            case 'smhd':
                box.name = "Sound Media Header Box";
                readFullHeader();
                box.balance = stream.readFP8();
                stream.reserved(2, 0);
                break;
            case 'mdat':
                box.name = "Media Data Box";
                // assert (box.size >= 8, "Cannot parse large media data yet.");
                // box.data = stream.readU8Array(remainingBytes());
                box.data = null
                stream.advance(remainingBytes());
                break;
            default:
                skipRemainingBytes();
                break;
            };
            return box;
        },
        read: function () {
            var start = (new Date).getTime();
            this.file = {};
            this.readBoxes(this.stream, this.file);
            self.postMessage("Parsed stream in " + ((new Date).getTime() - start) + " ms");
        },
        traceSamples: function () {
            var video = this.tracks[1];
            var audio = this.tracks[2];

            console.info("Video Samples: " + video.getSampleCount());
            console.info("Audio Samples: " + audio.getSampleCount());

            var vi = 0;
            var ai = 0;

            for (var i = 0; i < 100; i++) {
                var vo = video.sampleToOffset(vi);
                var ao = audio.sampleToOffset(ai);

                var vs = video.sampleToSize(vi, 1);
                var as = audio.sampleToSize(ai, 1);

                if (vo < ao) {
                    console.info("V Sample " + vi + " Offset : " + vo + ", Size : " + vs);
                    vi ++;
                } else {
                    console.info("A Sample " + ai + " Offset : " + ao + ", Size : " + as);
                    ai ++;
                }
            }
        }
    };
    return constructor;
})();

var lazy_bisect_left = function(accessor, v, lo, hi) {
    var mid;
    lo = lo;
    hi = hi;
    while (lo < hi) {
        mid = Math.floor((lo+hi)/2);
        if (accessor(mid) < v) { lo = mid+1; }
        else { hi = mid; }
    }
    return lo
}

var MP4Track = (function track () {
    function constructor(file, trak) {
        this.file = file;
        this.trak = trak;
    }

    constructor.prototype = {
        byteToSample: function(bytes) {
            // go from "bytes" scale to closest sample
            function accessor(samp) {
                return this.sampleToOffset(samp);
            }
            var samp = lazy_bisect_left( _.bind(accessor,this), bytes, 0, this.getSampleCount() );
            return samp;
        },
        sampleToTime: function(samp) {
            function accessor(t) {
                return this.timeToSample(t);
            }
            var rt = lazy_bisect_left( _.bind(accessor,this), samp, 0, this.getTotalTime() );
            return rt;
        },
        byteToTimeInSeconds: function(bytes) {
            return this.sampleToTime(this.byteToSample(bytes))/this.getTimeScale();
        },
        isVideo: function() {
            return this.trak.tkhd.width > 0;
        },
        secondsToChunkIncludingEdits: function(t) {

            if (this.trak.edts) {
                assert(this.trak.edts.elst.table.length == 1)
                var abstime = t - this.trak.edts.elst.table[0].time/this.getTimeScale();
            } else {
                var abstime = t;
            }
            if (this.isVideo()) { console.log("VIDEO TRACK") }
            console.log('abstime',t,abstime);
            var sample = this.timeToSample( t * this.getTimeScale() );

            if (this.trak.mdia.minf.stbl.stss) {
                var samps = this.trak.mdia.minf.stbl.stss.samples
                var bi = bisect_left( samps, sample );
                var keyframe_sample_idx = Math.max(0, bi - 2); // go back one keyframe
                console.log('keyframe sample idx',keyframe_sample_idx);
                var keyframe_sample = samps[keyframe_sample_idx];
                assert(keyframe_sample !== undefined);
            } else {
                var keyframe_sample = Math.max(0, sample); // audio has no keyframes, but needs to prebuffer..
                // bad guess at presampling
            }
            console.log('keyframe sample',keyframe_sample);
            // need to move back to first entry in "stss" // iframe sync sample thingie
            


            keyframe_sample = Math.max(0, keyframe_sample); // move back a single sample... cuz chrome needs to? keyframes need it? dunno
            var offset = this.sampleToOffset(keyframe_sample);
            console.log('offset',offset);
            return offset
        },
        getSampleSizeTable: function () {
            return this.trak.mdia.minf.stbl.stsz.table;
        },
        getSampleCount: function () {
            return this.getSampleSizeTable().length;
        },
        /**
         * Computes the size of a range of samples, returns zero if length is zero.
         */
        sampleToSize: function (start, length) {
            var table = this.getSampleSizeTable();
            var size = 0;
            for (var i = start; i < start + length; i++) {
                size += table[i];
            }
            return size;
        },
        /**
         * Computes the chunk that contains the specified sample, as well as the offset of
         * the sample in the computed chunk.
         */
        sampleToChunk: function (sample) {

            /* Samples are grouped in chunks which may contain a variable number of samples.
             * The sample-to-chunk table in the stsc box describes how samples are arranged
             * in chunks. Each table row corresponds to a set of consecutive chunks with the
             * same number of samples and description ids. For example, the following table:
             *
             * +-------------+-------------------+----------------------+
             * | firstChunk  |  samplesPerChunk  |  sampleDescriptionId |
             * +-------------+-------------------+----------------------+
             * | 1           |  3                |  23                  |
             * | 3           |  1                |  23                  |
             * | 5           |  1                |  24                  |
             * +-------------+-------------------+----------------------+
             *
             * describes 5 chunks with a total of (2 * 3) + (2 * 1) + (1 * 1) = 9 samples,
             * each chunk containing samples 3, 3, 1, 1, 1 in chunk order, or
             * chunks 1, 1, 1, 2, 2, 2, 3, 4, 5 in sample order.
             *
             * This function determines the chunk that contains a specified sample by iterating
             * over every entry in the table. It also returns the position of the sample in the
             * chunk which can be used to compute the sample's exact position in the file.
             *
             * TODO: Determine if we should memoize this function.
             */

            var table = this.trak.mdia.minf.stbl.stsc.table;

            if (table.length === 1) {
                var row = table[0];
                assert (row.firstChunk === 1);
                return {
                    index: sample / row.samplesPerChunk,
                    offset: sample % row.samplesPerChunk
                };
            }

            var totalChunkCount = 0;
            for (var i = 0; i < table.length; i++) {
                var row = table[i];
                if (i > 0) {
                    var previousRow = table[i - 1];
                    var previousChunkCount = row.firstChunk - previousRow.firstChunk;
                    var previousSampleCount = previousRow.samplesPerChunk * previousChunkCount;
                    if (sample >= previousSampleCount) {
                        sample -= previousSampleCount;
                        if (i == table.length - 1) {
                            return {
                                index: totalChunkCount + previousChunkCount + Math.floor(sample / row.samplesPerChunk),
                                offset: sample % row.samplesPerChunk
                            };
                        }
                    } else {
                        return {
                            index: totalChunkCount + Math.floor(sample / previousRow.samplesPerChunk),
                            offset: sample % previousRow.samplesPerChunk
                        };
                    }
                    totalChunkCount += previousChunkCount;
                }
            }
            assert(false);
        },
        chunkToOffset: function (chunk) {
            var table = this.trak.mdia.minf.stbl.stco.table;
            return table[chunk];
        },
        sampleToOffset: function (sample) {
            var res = this.sampleToChunk(sample);
            var offset = this.chunkToOffset(res.index);
            return offset + this.sampleToSize(sample - res.offset, res.offset);
        },
        /**
         * Computes the sample at the specified time.
         */
        timeToSample: function (time) {
            /* In the time-to-sample table samples are grouped by their duration. The count field
             * indicates the number of consecutive samples that have the same duration. For example,
             * the following table:
             *
             * +-------+-------+
             * | count | delta |
             * +-------+-------+
             * |   4   |   3   |
             * |   2   |   1   |
             * |   3   |   2   |
             * +-------+-------+
             *
             * describes 9 samples with a total time of (4 * 3) + (2 * 1) + (3 * 2) = 20.
             *
             * This function determines the sample at the specified time by iterating over every
             * entry in the table.
             *
             * TODO: Determine if we should memoize this function.
             */
            var table = this.trak.mdia.minf.stbl.stts.table;
            var sample = 0;
            for (var i = 0; i < table.length; i++) {
                var delta = table[i].count * table[i].delta;
                if (time >= delta) {
                    time -= delta;
                    sample += table[i].count;
                } else {
                    return sample + Math.floor(time / table[i].delta);
                }
            }
        },
        /**
         * Gets the total time of the track.
         */
        getTotalTime: function () {
            if (PARANOID) {
                var table = this.trak.mdia.minf.stbl.stts.table;
                var duration = 0;
                for (var i = 0; i < table.length; i++) {
                    duration += table[i].count * table[i].delta;
                }
                assert (this.trak.mdia.mdhd.duration == duration);
            }
            return this.trak.mdia.mdhd.duration;
        },
        getTotalTimeInSeconds: function () {
            return this.timeToSeconds(this.getTotalTime());
        },
        getTimeScale: function () {
            return this.trak.mdia.mdhd.timeScale;
        },
        /**
         * Converts time units to real time (seconds).
         */
        timeToSeconds: function (time) {
            return time / this.getTimeScale();
        },
        /**
         * Converts real time (seconds) to time units.
         */
        secondsToTime: function (seconds) {
            return seconds * this.getTimeScale();
        },
        foo: function () {
            var maxiter = 200;
            /*
              for (var i = 0; i < Math.min(maxiter,this.getSampleCount()); i++) {
              var res = this.sampleToChunk(i);
              console.info("Sample " + i + " -> " + res.index + " % " + res.offset +
              " @ " + this.chunkToOffset(res.index) +
              " @@ " + this.sampleToOffset(i));
              }
            */
            console.info("Total Time: " + this.timeToSeconds(this.getTotalTime()));
            var total = this.getTotalTimeInSeconds();
            for (var i = 50; i < Math.min(maxiter,total); i += 0.1) {
                // console.info("Time: " + i.toFixed(2) + " " + this.secondsToTime(i));

                console.info("Time: " + i.toFixed(2) + " " + this.timeToSample(this.secondsToTime(i)));
            }

        },
        /**
         * AVC samples contain one or more NAL units each of which have a length prefix.
         * This function returns an array of NAL units without their length prefixes.
         */
        getSampleNALUnits: function (sample) {
            var bytes = this.file.stream.bytes;
            var offset = this.sampleToOffset(sample);
            var end = offset + this.sampleToSize(sample, 1);
            var nalUnits = [];
            while(end - offset > 0) {
                var length = (new Bytestream(bytes.buffer, offset)).readU32();
                nalUnits.push(bytes.subarray(offset + 4, offset + length + 4));
                offset = offset + length + 4;
            }
            return nalUnits;
        }
    };
    return constructor;
})();

