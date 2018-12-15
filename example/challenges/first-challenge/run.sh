#!/usr/bin/env bash

# install NPM dependencies
npm install

# change permissions on node_modules to allow clean up after completion
chmod -R 777 node_modules

# run tests
echo "== BEGIN TESTS =="
npx mocha --reporter=spec test