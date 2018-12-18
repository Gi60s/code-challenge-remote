'use strict'
const { addTwoNumbers } = require('..')
const { expect } = require('chai')

/* globals describe it */
describe('test suite', () => {
  it('can add two numbers', () => {
    expect(addTwoNumbers(1,5)).to.equal(6)
  })
})