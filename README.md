# code-challenge-remote

This module acts as both the client and Express server middleware to handle code challenges.

This documentation is broken up into three sections:

1. [Client Installation and Usage](#client-installation-and-usage)
2. [Server Setup](#server-setup)
3. [Challenge Setup](#challenge-setup)

## Client Installation and Usage

### Installation

You must have node 8 or newer installed, then run this command:

```bash
npm install -g code-challenge-remote
```

### Usage

#### Log In

This command requires you know the URL for the code challenge server which should be provided by the server offering the code challenge:

```bash
challenge login <remote_url> <session_id>
```

#### Help

Get general help, or if the command is specified then get help about a specific command.

```bash
challenge help [command]
```

#### Log Out

Kill the client's session.

```bash
challenge logout
```

#### Initialize a Challenge

Download a challenge from the challenge server. If you omit the output directory then the current directory will be used.
 
You can use the `status` command to find out which challenges exist.

```bash
challenge init <name> [output_dir]
```

#### Get Status

This will get you a list of all challenges and for any that you have submitted you will also see a submission date and percentage of what was passed.

```bash
challenge status
```

#### Submit a Challenge

Once you've completed a challenge you can submit it to the server for additional testing. If you omit the challenge directory then the current directory will be used.

```bash
challenge submit <challenge> [challenge_dir]
```

## Server Setup

**Example**

```js
'use strict'
const express = require('express')
const session = require('express-session')
const Challenge = require('code-challenge-remote')
const path = require('path')

const app = express()
const cookieName = 'my-cookie'

// configure the code challenge 
// (see the server challenge configuration section below this example for details)
const challenge = new Challenge({
  challengePath: path.resolve(__dirname, 'challenges'),
  challengeUrl: 'http://localhost:' + port + '/challenge',
  getUserId: async req => {
    if (!req.session || !req.session.user) return null
    return {
      id: req.session.user,
      username: req.session.user
    }
  },
  sessionCookieName: cookieName,
  store: Challenge.fileStore(path.resolve(__dirname, 'store'))
})

// run session middleware
app.use(session({
  name: cookieName,
  secret: 'secret',
  resave: false,
  saveUninitialized: false
}))

// run challenge middleware
app.use('/challenge', challenge.middleware())

// A URL endpoint to log in to the server
// You should use something better like passportjs
app.get('/login', (req, res) => {
  const user = req.query.user
  if (user) {
    req.session.user = user
    req.session.save()
    res.status(200)
    res.send(challenge.getLoginCommand(req))
  } else {
    res.sendStatus(403)
  }
})

// An endpoint to kill the session
app.get('/logout', (req, res) => {
  req.session.destroy(function (err) {
    if (err) {
      console.error(err.stack)
      res.sendStatus(500)
    } else {
      res.sendStatus(200)
    }
  })
})

app.listen(port, function (err) {
  if (err) return console.error(err.stack);
  console.log('Listening on port: ' + port)
})
```

### Server Challenge Configuration

These are the options to configure the challenge middleware:

- *challengeUrl* - The URL that points to the challenge middleware path.

- *getUserId* - A function that gets the request object and needs to return an object with the user's unique identifier and their username. This function can return a promise that resolves to the object.

- *sessionCookieName* - The cookie name being used to store the session information.

- *store* - The [data store controller](#data-store-controller) for submitted challenges.

### Data Store Controller

The data store controller is used to save and load user's challenge submissions. This package includes a built in file store module, but that is not recommended for production. You'll probably want to write your own data store controller that saves and loads data from a database.

A data store controller needs to export an object with two properties:

- *save* - A function to save submission results. It will receive the following parameters:
 
    - *userId* - The user's unique ID
    
    - *challengeName* - The name of the challenge being saved
    
    - *date* - A date object for the date this challenge was submitted
    
    - *score* - A numeric float between 0 and 1 that represents the ratio of tests passed to total tests. For example, if `3` out of `4` tests passed then this value would be `0.75`.
    
    This function should return a promise that resolves if the save was successful or rejects if the save failed.
    
- *load* - A function to load submission results. It will receive these parameters:

    - *userId* - The user's unique id
    
    - *add* - A function for adding entries to be returned at the end of the load sequence. This function should be called by your loaded to add the submission entries. It takes the following parameters:
    
        - *challenge* - The name of the challenge
        
        - *date* - A Date object for the date that the challenge was submitted
        
        - *score* - The numeric float, a value between 0 and 1
    
    This function should return a promise that resolves on successful load or rejects on failure to load. If a user has not submitted any challenges that should still return a promise that resolves.

## Challenge Setup

- All challenges will be run in Docker containers to enable code isolation and to prevent the user from running malicious code on your machine.

- Every challenge exists within it's own directory. The name of the directory is the challenge name that will be used to download and submit challenges.

- All challenge directories are kept within a single directory as defined in the [server challenge configuration](#server-challenge-configuration).

Each directory has the following components:

1. *config.json* - An optional configuration file that can set the max upload size and max submission run time. Defaults to `{ "maxUploadSize": "2M", "maxRunTime": 30000 }`.

2. *docker-compose.yml* - A Docker compose file if using compose. Either this or a `Dockerfile` (or both) must exist.

    Configure this docker-compose file to your liking. The environment variable `UPLOADED_CHALLENGE_DIR` can be used to create a volume mount. (See the example directory's `first-challenge` for an example.)
    
3. *Dockerfile* - A Dockerfile. This must exist if a `docker-compose.yml` does not exist.

4. *hooks.js* - A NodeJS module that can export these functions as properties to be used as hooks. This file is run in its own memory space for each submitted result. That means if you declare module scoped variables they will only exist for that challenge submission.

    - *beforeOverwrite* - Run before the overwrite directory merges into the uploaded content. This function receives two parameters 1) uploadedFilesDir and 2) overwriteFilesDir and should return a promise.
    
    - *afterOverwrite* - Run after the overwrite directory merges into the uploaded content. This function receives two parameters 1) uploadedFilesDir and 2) overwriteFilesDir and should return a promise.
    
    - *parseTestResults* - This function is required if you want to be able to record scores for submitted challenges. It receives a string containing the output generated by running the Docker container. With this function, parse the output and return a Promise that resolves to an object with these properties:
    
        - *body* - The body to send to the client for output. Generally you'd want this to be the test output.
        
        - *passed* - The number of tests passed.
        
        - *failed* - The number of tests failed

5. *ignore.txt* - Defines the patterns for file names or directories that should not be transferred between the server and the client. Put one pattern per line within the file. Currently only plain text matching works. A good use case for this would be to exclude a `node_modules` directory.

5. *starter* - A required directory that contains the contents that will be downloaded to a client computer when a challenge is initialized. All contents of this file will be downloaded unless it matches an entry in the `ignore.txt` file.

6. *overwrite* - An optional directory that will be merged into and overwrite existing files uploaded by the user. This is useful if you want to control some of the files submitted by the user.

**Example Directory Structure**

```
- /challenges                         [DIR]
  - first-challenge                   [DIR]
    - overwrite                       [DIR]
      - ...                           [FILES AND FOLDERS]
    - starter                         [DIR]
      - README.md                     [FILE]
      - ... set up files              [FILES AND FOLDERS]
      - ... initial project files     [FILES AND FOLDERS]
    - config.json                     [FILE]
    - hooks.js                        [FILE]
    - ignore.txt                      [FILE]
```