'use strict'

module.exports = function (stream) {
  return new Promise((resolve, reject) => {
    let remaining = 2

    function end () {
      remaining--
      if (remaining === 1) setTimeout(resolve, 500)
      if (remaining <= 0) resolve()
    }

    stream.on('error', reject)
    stream.on('close', end)
    stream.on('end', end)
  })
}
