'use strict';

var Client = require('./client');

module.exports = function (customer_key, environment_key, options) {
    options = options || {};

    return new Client({
        customer_key: customer_key,
        environment_key: environment_key,
        options: options
    });
};

module.exports.Client = Client;
