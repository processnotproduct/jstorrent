rm package_beta.zip

cp manifest_beta.json manifest.json

zip package_beta.zip -r * -x package.sh -x *.git* -x "*.*~" -x extension -x "*chrome-platform-analytics*" -x "*polyfill*" -x output -x "extension/*" -x manifest.json.scratch -x manifest_stable.json -x manifest_beta.json
