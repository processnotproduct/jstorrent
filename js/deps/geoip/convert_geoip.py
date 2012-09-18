# http://www.maxmind.com/app/csv
# converts free csv file into javascript
# see bittorrent.common.js for the geoip functions

import csv
import json

fo = open('GeoIPCountryWhois.csv')
d = {}
fout = open('out.js','w')
fout.write('var geoip_ip = [\n')
spamreader = csv.reader(fo, delimiter=',', quotechar='"')
for line in spamreader:
    beg_ip, end_ip, beg_num, end_num, country, country_long = line
    if country not in d:
        d[country] = country_long
    fout.write('%s,\n' % (beg_num))
fout.write('];\n\n')

fo.close()

fo = open('GeoIPCountryWhois.csv')
fout.write('var geoip_country = [\n')
spamreader = csv.reader(fo, delimiter=',', quotechar='"')
for line in spamreader:
    beg_ip, end_ip, beg_num, end_num, country, country_long = line
    fout.write('"%s",\n' % (country))
fout.write('];\n\n')
fout.write('var geoip_country_name = ')
fout.write(json.dumps(d,indent=2))
fout.write(';')


fout.close
