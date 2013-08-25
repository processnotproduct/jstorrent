rm package.zip
zip package.zip -r * -x package.sh -x *.git* -x "*.*~" -x extension -x "*chrome-platform-analytics*" -x "*polyfill*" -x output -x "extension/*" -x manifest.json.scratch
