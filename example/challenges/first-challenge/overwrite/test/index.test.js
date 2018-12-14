'use strict'
const { addTwoNumbers } = require('..')
const { expect } = require('chai')

/* globals describe it */
describe('test suite', () => {
  it('can add two numbers', () => {
    expect(addTwoNumbers(1, 5)).to.equal(6)
  })

  it('can add two negative numbers', () => {
    expect(addTwoNumbers(-1, -2)).to.equal(-3)
  })

  it('can add two random numbers', () => {
    const num1 = Math.random()
    const num2 = Math.random()
    expect(addTwoNumbers(num1, num2)).to.equal(num1 + num2)
  })

  it('throws an error if the input is not numbers', () => {
    const str1 = getRandomLetter()
    const str2 = getRandomLetter()
    expect(() => addTwoNumbers(str1, str2)).to.throw(Error)
  })
})

function getRandomLetter () {
  const options = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'
  const index = Math.floor(Math.random() * options.length)
  return options[index]
}