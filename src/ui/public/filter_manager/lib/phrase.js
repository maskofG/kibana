define(function (require) {
  let _ = require('lodash');
  return function buildPhraseFilter(field, value, indexPattern) {
    let filter = { meta: { index: indexPattern.id} };

    if (field.scripted) {
      filter.script = {
        script: '(' + field.script + ') == value',
        lang: field.lang,
        params: {
          value: value
        }
      };
      filter.meta.field = field.name;
    } else {
      // check for nested
      if (indexPattern.fields.byName[field.name].nestedPath) {
        filter.query = { nested : { path : indexPattern.fields.byName[field.name].nestedPath, query : { match : {}}}};
        filter.query.nested.query.match[field.name] = {
          query: value,
          type: 'phrase'
        };
      } else {
        filter.query = { match: {} };
        filter.query.match[field.name] = {
          query: value,
          type: 'phrase'
        };
      }
    }
    return filter;
  };
});
