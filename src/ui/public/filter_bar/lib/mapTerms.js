define(function (require) {
  let _ = require('lodash');
  return function mapTermsProvider(Promise, courier) {
    return function (filter) {
      let key;
      let value;
      let field;
      if (filter.query && (filter.query.match || filter.query.nested.query)) {
        return courier
        .indexPatterns
        .get(filter.meta.index).then(function (indexPattern) {
          key = (filter.query.nested ? _.keys(filter.query.nested.query.match)[0] : _.keys(filter.query.match)[0]);
          field = indexPattern.fields.byName[key];
          value = (filter.query.nested ? filter.query.nested.query.match[key].query : filter.query.match[key].query);
          value = field.format.convert(value);
          return { key: key, value: value };
        });
      }
      return Promise.reject(filter);
    };
  };
});
