#!/usr/bin/env bash

# build the image if not alread built
docker build --tag first-challenge .

# run the container, mounting the user files in read only mode
docker run --it -rm -v ${0}:/root:ro first-challenge npx mocha --reporter=json test