# featureswitches-node
A Node.js client for interacting with [FeatureSwitches.com](https://featureswitches.com).  This library is under active development and is likely to change frequently.

## Installation

Run the following comands in a terminal:

```bash
$ npm install featureswitches
```

## Usage
```javascript
// Include and initialize FeatureSwitches
var featureswitches = require('featureswitches')('customer_api_key', 'environment_api_key', {options});

// Ensure that the API credentials are valid
featureswitches.authenticate().then(function(result) {
  if (result) {
    // Authentication Successful
  } else {
    // Authentication Failed
  }
});

// Add a user
featureswitches.add_user('user_identifier', '[optional_customer_identifier]', '[optional_name]', '[optional_email'])
  .then(function(result) {
    // Result is boolean to indicate success
  });

// Check if a feature is enabled
featureswitches.is_enabled('feature_key', '[optional_user_identifier]')
  .then(function(result) {
    if (result instanceof Error) {
      // Something went wrong making the request
    } else {
      // Result is a boolean indicating if the feature is enabled
    }
  });
```

## Configuration Options
A few options are available to be tweaked if you so choose.  The library makes use of a local cache to minimize requests back to the FeatureSwitches server.  Additionally, a check it performed at an interval to automatically re-sync feature state when changes are made in the dashboard.

```javascript
{
  cache_timeout: SECONDS, // optional, defaults to 300 seconds
  check_interval: SECONDS // optional, defaults to 10 seconds
}
```
