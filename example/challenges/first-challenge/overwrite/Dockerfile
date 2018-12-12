FROM node:10
WORKDIR /root

# install dependencies
ADD package.json /root
ADD package-lock.json /root
RUN npm install

# add the remaining files
ADD .. /root