define(function (require) {
  return function MapperService(Private, Promise, es, config, kbnIndex) {
    var _ = require('lodash');
    var moment = require('moment');

    var IndexPatternMissingIndices = require('ui/errors').IndexPatternMissingIndices;
    var transformMappingIntoFields = Private(require('ui/index_patterns/_transform_mapping_into_fields'));
    var intervals = Private(require('ui/index_patterns/_intervals'));
    var patternToWildcard = Private(require('ui/index_patterns/_pattern_to_wildcard'));

    var LocalCache = Private(require('ui/index_patterns/_local_cache'));

    function Mapper() {

      // Save a reference to mapper
      var self = this;

      // proper-ish cache, keeps a clean copy of the object, only returns
		// copies of it's copy
      var fieldCache = self.cache = new LocalCache();

      /**
		 * Gets an object containing all fields with their mappings
		 *
		 * @param {dataSource}
		 *            dataSource
		 * @param {boolean}
		 *            skipIndexPatternCache - should we ping the index-pattern
		 *            objects
		 * @returns {Promise}
		 * @async
		 */
      self.getFieldsForIndexPattern = function (indexPattern, skipIndexPatternCache) {
        var id = indexPattern.id;

        var cache = fieldCache.get(id);
        if (cache) return Promise.resolve(cache);

        if (!skipIndexPatternCache) {
          return es.get({
            index: kbnIndex,
            type: 'index-pattern',
            id: id,
            _sourceInclude: ['fields']
          })
          .then(function (resp) {
            if (resp.found && resp._source.fields) {
              fieldCache.set(id, JSON.parse(resp._source.fields));
            }
            return self.getFieldsForIndexPattern(indexPattern, true);
          });
        }

        var promise = Promise.resolve(id);
        if (indexPattern.intervalName) {
          promise = self.getIndicesForIndexPattern(indexPattern)
          .then(function (existing) {
            if (existing.matches.length === 0) throw new IndexPatternMissingIndices();
            return existing.matches.slice(-config.get('indexPattern:fieldMapping:lookBack')); // Grab
																								// the
																								// most
																								// recent
          });
        }

        return promise.then(function (indexList) {
          return es.indices.getMapping({
            index: indexList,
            type: '*',
            ignoreUnavailable: _.isArray(indexList),
            allowNoIndices: false,
            includeDefaults: true
          }).then(function (resp) {
            return es.indices.getFieldMapping({
              index: indexList,
              field: '*',
              ignoreUnavailable: _.isArray(indexList),
              allowNoIndices: false,
              includeDefaults: true
            }).then(function (fields) {
              var hierarchyPaths = {};
              _.each(resp, function (index, indexName) {
                if (indexName === kbnIndex) return;
                _.each(index.mappings, function (mappings, typeName) {
                  var parent = mappings._parent;
                  _.each(mappings.properties, function (field, name) {
                    // call the define mapping recursive function
                    defineMapping(parent, hierarchyPaths, undefined, name, field, undefined);
                  });
                });
              });
              return {
                hierarchy: hierarchyPaths,
                fields: fields
              };
            });
          });
        })
        .catch(handleMissingIndexPattern)
        .then(transformMappingIntoFields)
        .then(function (fields) {
          fieldCache.set(id, fields);
          return fieldCache.get(id);
        });
      };

      self.getIndicesForIndexPattern = function (indexPattern) {
        return es.indices.getAliases({
          index: patternToWildcard(indexPattern.id)
        })
        .then(function (resp) {
          // var all = Object.keys(resp).sort();
          var all = _(resp)
          .map(function (index, key) {
            if (index.aliases) {
              return [Object.keys(index.aliases), key];
            } else {
              return key;
            }
          })
          .flattenDeep()
          .sort()
          .uniq(true)
          .value();

          var matches = all.filter(function (existingIndex) {
            var parsed = moment(existingIndex, indexPattern.id);
            return existingIndex === parsed.format(indexPattern.id);
          });

          return {
            all: all,
            matches: matches
          };
        })
        .catch(handleMissingIndexPattern);
      };

      /**
		 * Clears mapping caches from elasticsearch and from local object
		 *
		 * @param {dataSource}
		 *            dataSource
		 * @returns {Promise}
		 * @async
		 */
      self.clearCache = function (indexPattern) {
        fieldCache.clear(indexPattern);
        return Promise.resolve();
      };
    }

    /**
	 * This function will recursively define all of the properties/mappings
	 * contained in the index. This will build out full name paths and detect
	 * nested paths for any child attributes.
	 */
    function defineMapping(parent, hierarchyPaths, parentPath, name, rawField, nestedPath) {
      var fullName = name;
      // build the fullName first
      if (parentPath !== undefined) {
        fullName = parentPath + '.' + name;
      }

      if (rawField.type !== undefined) {
        if (rawField.type === 'nested') {
          nestedPath = fullName;
        }

        hierarchyPaths[fullName] = nestedPath;
      }

      _.each(rawField.properties, function (field, name) {
        defineMapping(parent, hierarchyPaths, fullName, name, field, nestedPath);
      });

      _.each(rawField.fields, function (field, name) {
        defineMapping(parent, hierarchyPaths, fullName, name, field, nestedPath);
      });

    }

    function handleMissingIndexPattern(err) {
      if (err.status >= 400) {
        // transform specific error type
        return Promise.reject(new IndexPatternMissingIndices());
      } else {
        // rethrow all others
        throw err;
      }
    }

    return new Mapper();
  };
});
