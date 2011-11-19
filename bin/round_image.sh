#!/bin/bash

FILES=../weather@fpmurphy.com/icons/*.png
for file in $FILES
do
    echo "Processing $file"

    convert $file \
         \( +clone  -alpha extract \
            -draw 'fill black polygon 0,0 0,5 5,0 fill white circle 5,5 5,0' \
            \( +clone -flip \) -compose Multiply -composite \
            \( +clone -flop \) -compose Multiply -composite \
         \) -alpha off -compose CopyOpacity -composite  $file
done