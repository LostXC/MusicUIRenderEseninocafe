#!/bin/bash
set -e

echo "Cloning FFmpeg source..."
if [ ! -d "ffmpeg_src" ]; then
  git clone --depth 1 https://git.ffmpeg.org/ffmpeg.git ffmpeg_src
fi

cd ffmpeg_src

echo "Configuring minimal FFmpeg..."
./configure \
  --disable-everything \
  --enable-encoder=qtrle \
  --enable-decoder=png \
  --enable-muxer=mov \
  --enable-demuxer=image2 \
  --enable-protocol=file \
  --enable-zlib \
  --enable-filter=scale

echo "Compiling..."
make -j $(sysctl -n hw.ncpu)

echo "Copying binary to project root..."
cp ffmpeg ../ffmpeg
cd ..
rm -rf ffmpeg_src
echo "Done! Minimal FFmpeg created."
