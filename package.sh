rm package.zip

cp manifest_stable.json manifest.json

zip package.zip -r * -x package.sh -x *.git* -x "*.*~" -x extension -x "*chrome-platform-analytics*" -x "*polyfill*" -x output -x "extension/*" -x manifest.json.scratch -x manifest_beta.json -x manifest_stable.json
