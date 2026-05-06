$ErrorActionPreference = 'Stop'

# Create a single JS file using esbuild
./node_modules/.bin/esbuild "src/${env:DIST_FILE_NAME}.js" --bundle --outfile=./build/build.cjs --format=cjs --platform=node --target=node24 --inject:./src/lib/util/import-meta-url.js --define:import.meta.url=import_meta_url

# Generate blob to be injected into the binary
node --experimental-sea-config build-script/sea-config.json

# Get a copy of the Node executable
node -e "require('fs').copyFileSync(process.execPath, '${env:DIST_FILE_NAME}.exe')" 

# -------------------
# Remove the signature from the executable
$processOptions1 = @{
  FilePath = "C:\Program Files (x86)/Windows Kits/10/bin/10.0.22621.0/x64/signtool.exe"
  Wait = $true
  ArgumentList = "remove", "/s", "./${env:DIST_FILE_NAME}.exe"
  WorkingDirectory = "."
  NoNewWindow = $true
}
Start-Process @processOptions1

npx postject "${env:DIST_FILE_NAME}.exe" NODE_SEA_BLOB ./build/sea-prep.blob --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2

# -------------------
# Sign the executable
# 1st signing
$processOptions1 = @{
  FilePath = "C:\Program Files (x86)/Windows Kits/10/bin/10.0.22621.0/x64/signtool.exe"
  Wait = $true
  ArgumentList = "sign", "/sha1", "$env:CODESIGN_WIN_THUMBPRINT", "/tr", "http://time.certum.pl", "/td", "sha256", "/fd", "sha1", "/v", "./${env:DIST_FILE_NAME}.exe"
  WorkingDirectory = "."
  NoNewWindow = $true
}
Start-Process @processOptions1

# -------------------
# 2nd signing
$processOptions2 = @{
  FilePath = "C:\Program Files (x86)/Windows Kits/10/bin/10.0.22621.0/x64/signtool.exe"
  Wait = $true
  ArgumentList = "sign", "/sha1", "$env:CODESIGN_WIN_THUMBPRINT", "/tr", "http://time.certum.pl", "/td", "sha256", "/fd", "sha256", "/v", "./${env:DIST_FILE_NAME}.exe"
  WorkingDirectory = "."
  NoNewWindow = $true
}
Start-Process @processOptions2

# -------------------
# Create release binary zip
$compress = @{
  Path = "./${env:DIST_FILE_NAME}.exe"
  CompressionLevel = "Fastest"
  DestinationPath = "${env:RELEASE_VERSION}-win.zip"
}
Compress-Archive @compress

# -------------------
# Clean up
Remove-Item -Force ./build/build.cjs

dir
