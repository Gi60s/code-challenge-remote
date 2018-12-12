# code-challenge-remote

## Challenge Setup

**Example Directory Structure**

```
- /challenges                         [DIR]
  - first-challenge                   [DIR]
    - overwrite                       [DIR]
      - ... unchangeable files        [FILES AND FOLDERS]
    - starter                         [DIR]
      - README.md                     [FILE]
      - ... set up files              [FILES AND FOLDERS]
      - ... initial project files     [FILES AND FOLDERS]
    - ignore.txt                      [FILE]
    - before-test-runner.js           [FILE]
    - test-runner.sh                  [FILE]
    - test-runner-parser.js           [FILE]
```

1. Decide where on your file system you will store code challenges. Example: `/challenges`.

2. Create a directory within the code challenges directory. The name of the directory is the name of the code challenge. Example:`/challenges/first-challenge`.

3. Optionally, within the code challenge directory, create an [overwrite directory](#overwrite-directory). Example:`/challenges/first-challenge/overwrite`.

4. Within the code challenge directory, create a [starter directory](#starter-directory). Example:`/challenges/first-challenge/starter`.

5. Optionally, within the code challenge directory, create an `ignore.txt` file. Each line in this file will be compared to every file in the starter (when downloading) or in the upload (when submitting) and make sure that those files are not sent between the server and client.

5. Optionally, within the code challenge directory, create a `before-test-runner.js` script. This will run after the user has submitted files but before the tests are run on the server.

6. Within the code challenge directory, create a `test-runner.sh` (or a `test-runner.bat` if on Windows) file that runs your tests. It should initiate a Docker container to run the tests otherwise you will seriously compromise your server. 

6. Within the code challenge directory, create a `test-runner-parser.js` file. It will receive the output produced by the `test-runner` script. It must parse the output and return an object with the following format:

     ```json
     {
       "duration": 15,
       "failed": 0,
       "output": "the stdout to send to the client",
       "passed": 5
     }
     ```
### Overwrite Directory

This directory is used to overwrite files submitted by the user to the server. If a file in this directory has the same name and relative path as one submitted by the user, the one submitted by the user will be overwritten by this file prior to tests running.

### Starter Directory

The starter directory should have the following files:

- `.gitignore` - A file that will list one file path pattern per line. Any files within the starter that match one pattern or more will not be sent to the user and will not be received from the user.

- `README.md` - a file with instructions for the challenge
       
- All necessary set up scripts. For example, if using JavaScript you might have a `package.json` file.

- Any code you want the user to start with 

### How User Submission Works

1. The user will use the client to submit their code.

2. The server will receive the code.

3. The server will overwrite any files that

## Client Commands

```bash
npm install -g code-challenge-remote
```

```bash
challenge login <remote_url> <session_id>
```

```bash
challenge help
```

**The following commands require you to be logged in**

```bash
challenge logout
```

```bash
challenge init <name> <output_dir>
```

```bash
challenge status
```

```bash
challenge test [challenge_dir]
```

```bash
challenge submit [challenge_dir]
```