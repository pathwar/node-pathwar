var _ = require('lodash'),
    Q = require('q'),
    jsonPath = require('JSONPath'),
    moment = require('moment'),
    program = require('commander'),
    utils = require('./utils'),
    validator = require('validator');


program
  .version(utils.getVersion('..'))
  .option('--api-endpoint <url>', 'set the API endpoint')
  .option('--token <token>', 'set the token');
//.option('--dry-run', 'do not execute actions')
//.option('-D, --debug', 'enable debug mode')


program._events.version = null;
program
  .command('version')
  .description('show the version information')
  .action(function() {
    console.log('Client version: ' + utils.getVersion('..'));
    console.log('Node.js version (client): ' + process.version);
    console.log('OS/Arch (client): ' + process.platform + '/' + process.arch);
    // FIXME: add information about server
  });


program
  .command('ls <type> [conditions...]')
  .alias('select')
  .description('list objects')
  .option('--no-trunc', "don't truncate output")
  .option('-f, --field <field>', 'fields to print', utils.collect, [])
  .option('-q, --quiet', 'only print ids')
  .option('-l, --limit <max_results>', 'limit results to <max_results> items', 50)
  .option('-p, --page <page>', 'use page <page>', 1)
  .option('-a, --all', 'automatically walk paginated results')
  .option('-o, --order <field>', 'order by <field>', '@_updated')
  .action(function(type, conditions, options) {
    var client = utils.newApi(options);

    type = type || '';
    var query = {};
    if (conditions.length) {
      query['where'] = JSON.stringify(utils.castFields(type, conditions));
    }
    if (options.limit) {
      query['max_results'] = options.limit;
    }
    if (options.page) {
      query['page'] = options.page;
    }

    if (options.order) {
      query['sort'] = options.order.replace('@', '-');
    }

    var url = '/' + type + '?';
    _.forEach(query, function(value, key) {
      url += key + '=' + value + '&';
    });

    var getter = options.all ? 'all' : 'get';
    client[getter](url)
      .then(function(res) {
        if (!res.body._items.length) {
          console.error('No entries');
          return;
        }
        var items = res.body._items;

        // sorting items
        items = _.sortByOrder(items, ['_created'], [false]);

        // quiet mode
        if (options.quiet) {
          console.log(_.pluck(items, '_id').join('\n'));
          return;
        }

        // get all keys
        var keys = _.sortBy(_.difference(
          _.union(_.flatten(_.map(items, _.keys))),
          ['_links', '_etag']
        ));
        if (options.field.length) {
          keys = _.intersection(keys, options.field);
          var difference = _.difference(options.field, keys);
          if (difference.length) {
            utils.error('Unknown fields: ' + difference);
          }
        }
        if (!keys.length) {
          utils.panic('No fields to print');
        }

        var table = utils.newTable({
          head: keys
        });

        _.forEach(items, function(item) {
          var row = [];
          _.forEach(keys, function(key) {

            switch (key) {

              // Dates
            case '_updated':
            case '_created':
              row.push(moment(new Date(item[key])).fromNow());
              break;

              // UUID
            case '_id':
              row.push(utils.truncateUUID(item[key], options.trunc));
              break;

            default:
              var value = (item[key] === undefined || item[key] === null)
                ? '' : item[key].toString();

              if (validator.isUUID(value)) {
                value = utils.truncateUUID(value, options.trunc);
              }

              if (value.substring(0, 4) == '$2a$') {
                value = '<blowfish>';
              }

              row.push(value);
              break;
            }

          });
          table.push(row);
        });

        console.log(table.toString());
        var meta = res.body._meta;
        if (meta.max_results < meta.total || options.all) {
          console.log('Displaying items: ' + (meta.max_results * (meta.page - 1) + 1) + '-' + (meta.max_results * meta.page) + '/' + meta.total);
        }
      })
      .catch(utils.panic);
  });


program
  .command('cat <item>')
  .alias('show')
  .description('show object')
  .option('--no-trunc', "don't truncate output")
  .option('-f, --format <format>', 'format the output using the given template')
  .action(function(item, options) {
    var client = utils.newApi(options);

    // FIXME: resolve nested fields
    if (item[item.length - 1] == '/') {
      utils.panic("invalid item '" + item + "'");
    }
    utils.searchItems(item, client, function(items) {
      _.forEach(items, function(item) {
        if (options.trunc) {
          delete item._links;
          delete item._etag;
        }
        if (options.format) {
          var parsed = jsonPath.eval(item, '$' + options.format);
          if (typeof(parsed) === 'object' && parsed.length === 1) {
            console.log(parsed[0]);
          } else {
            console.log(parsed);
          }
        } else {
          console.log(JSON.stringify(item, null, 2));
        }
      });
    }, utils.panic);
  });


program
  .command('rm <item>')
  .alias('delete')
  .description('remove an item')
  .action(function(item, options) {
    var client = utils.newApi(options);

    // FIXME: add warning !

    utils.searchItems(item, client, function(items) {
      client.delete(items[0]).then(function(res) {
        console.log('done');
      }).catch(utils.panic);
    }, utils.panic);
  });


program
  .command('touch <type> [fields...]')
  .alias('add')
  .description('create an item')
  .action(function(type, fields, options) {
    var client = utils.newApi(options);

    var input = utils.castFields(type, fields);

    client.post('/' + type, input).then(function(res) {
      console.log(res.body._id);
    }).catch(utils.panic);
  });


program
  .command('update <item> <fields...>')
  .alias('patch')
  .description('update an item')
  .action(function(item, fields, options) {
    var client = utils.newApi(options);

    utils.searchItems(item, client, function(items) {
      var input = utils.castFields(items[0], fields);
      client.patch(items[0], input).then(function(res) {
        console.log(res.body._id);
      }).catch(utils.panic);
    }, utils.panic);
  });


module.exports = program;


module.exports.run = function() {
  program.parse(process.argv);
  if (!process.argv.slice(2).length) {
    program.outputHelp();
  }
};
