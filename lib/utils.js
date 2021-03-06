var _ = require('lodash'),
    Api = require('./index'),
    Q = require('q'),
    Table = require('cli-table'),
    debug = require('debug')('pathwar:utils'),
    rc = require('./config'),
    validator = require('validator');


module.exports.getVersion = function(module) {
  return require(module + '/package.json').version;
};


module.exports.newTable = function(options) {
  options = options || {};
  options.chars = options.chars || {
    'top': '', 'top-mid': '', 'top-left': '', 'top-right': '',
    'bottom': '', 'bottom-mid': '', 'bottom-left': '', 'bottom-right': '',
    'left': '', 'left-mid': '', 'mid': '', 'mid-mid': '',
    'right': '', 'right-mid': '', 'middle': ' '
  };
  options.style = options.style || {
    // 'padding-left': 0, 'padding-right': 0
  };
  return new Table(options);
};


module.exports.newApi = function(options) {
  var config = rc;

  options = options || {};
  options.parent = options.parent || {};
  if (options.parent.apiEndpoint) {
    config.api_endpoint = options.parent.apiEndpoint;
  }
  if (options.parent.token) {
    config.token = options.parent.token;
  }
  if (options.parent.dryRun) {
    config.dry_run = options.parent.dryRun;
  }
  return new Api(config);
};


module.exports.truncateUUID = function(input, truncStatus) {
  if (truncStatus || truncStatus == undefined) {
    return input.toString().substring(0, 8);
  } else {
    return input;
  }
};


var error = module.exports.error = function(msg) {
  if (msg && msg.options && msg.options.method && msg.options.url &&
      msg.statusCode && msg.error) {
    debug('panic', msg);
    console.error('> ' + msg.options.method + ' ' + msg.options.url);
    if (msg.error._error) {
      console.error('< ' + msg.error._error.message + ' (' + msg.statusCode + ')');
    } else {
      console.error('< ' + msg.statusCode + ' error');
    }
    if (msg.error._issues) {
      _.forEach(msg.error._issues, function(value, key) {
        console.error('  - ' + key + ': ' + JSON.stringify(value, null, 4));
      });
    }
    if (msg.error.fields) {
      _.forEach(msg.error.fields, function(value, key) {
        console.error(' - ' + key + ': ' + value.join('. '));
      });
    }
  } else {
    console.error(msg);
  }
};


var panic = module.exports.panic = function(msg) {
  error(msg);
  console.error('');
  console.error('   Hey ! this is probably a bug !');
  console.error('   Fresh beers will be waiting for you on our next meetup');
  console.error('                          if you report a new issue :) 🍻');
  console.error('');
  console.error('          https://github.com/pathwar/node-pathwar/issues');
  console.error('');
  process.exit(-1);
};


module.exports.collect = function(val, memo) {
  memo.push(val);
  return memo;
};


module.exports.searchItems = function(search, client, fn, errFn) {
    var getPromises = function(item) {
      if (item._type) {
        return [client.get('/' + item._type + '/' + item._id)];
      }

      return [
        client.get('/achievements/' + item._id),
        client.get('/activities/' + item._id),
        client.get('/coupons/' + item._id),
        client.get('/infrastructure-hijacks/' + item._id),
        client.get('/items/' + item._id),
        client.get('/level-hints/' + item._id),
        client.get('/level-instance-users/' + item._id),
        client.get('/level-instances/' + item._id),
        client.get('/level-statistics/' + item._id),
        client.get('/levels/' + item._id),
        client.get('/organization-achievements/' + item._id),
        client.get('/organization-coupons/' + item._id),
        client.get('/organization-items/' + item._id),
        client.get('/organization-level-hints/' + item._id),
        client.get('/organization-level-validations/' + item._id),
        client.get('/organization-levels/' + item._id),
        client.get('/organization-statistics/' + item._id),
        client.get('/organization-users/' + item._id),
        client.get('/organizations/' + item._id),
        client.get('/servers/' + item._id),
        client.get('/sessions/' + item._id),
        client.get('/user-hijack-proofs/' + item._id),
        client.get('/user-notifications/' + item._id),
        client.get('/user-organization-invites/' + item._id),
        client.get('/user-tokens/' + item._id),
        client.get('/users/' + item._id),
        client.get('/whoswho-attempts/' + item._id)
      ];
    };

  // FIXME: resolve truncated UUIDs

    var query;
    if (search.indexOf('/') > 0) {
      var split = search.split('/');
      query = {
        _type: split[0],
        _id: split[1]
      };
    } else {
      query = {
        _id: search
      };
    }

  return Q.allSettled(getPromises(query)).then(function(results) {
    var items = _.compact(_.pluck(_.pluck(results, 'value'), 'body'));
    fn(items);
    return items;
  }, errFn);
};



module.exports.castFields = function(type, fields) {
  var output = {};
  _.forEach(fields, function(field) {
    if (field[0] == '@') {
      var fs = require('fs');
      output = JSON.parse(fs.readFileSync(field.substring(1), 'utf-8'));
    } else {
      try {  // field is a valid JSON

        var parsed = JSON.parse(field);
        if (typeof(parsed) === 'object') {
          output = _.defaults(output, parsed);
        }

      } catch (e) {  // field is an operation

        var split = field.split('=');
        var key = split[0], value = split[1];

        if (['true', 'false', 'True', 'False'].indexOf(value) >= 0) {
          value = validator.toBoolean(value.toLowerCase());
        }

        if (validator.isNumeric(value)) {
          value = parseInt(value);
        }

        output[key] = value;
        // FIXME: cast values accordingly to the resources
        // FIXME: type can be a type OR an object, if so, we need to resolve type
      }
    }

  });
  return output;
};
