define(function (require) {
  require('ui/modules')
    .get('kibana')
    .directive('parseQuery', function (Private) {
      let fromUser = Private(require('ui/parse_query/lib/from_user'));
      let toUser = require('ui/parse_query/lib/to_user');
      let _ = require('lodash');

      return {
        restrict: 'A',
        require: 'ngModel',
        scope: {
          'ngModel': '='
        },
        link: function ($scope, elem, attr, ngModel) {
          let init = function () {
            $scope.ngModel = fromUser($scope.ngModel, ($scope ? $scope.$parent : undefined));
          };

          let fieldMap;

          if ($scope.$parent.indexPattern) {
            fieldMap = $scope.$parent.indexPattern.fields;
          }

          toUser.setIndexPattern(fieldMap);
          fromUser.setIndexPattern(fieldMap);
          ngModel.$parsers.push(fromUser);
          ngModel.$formatters.push(toUser);

          init();
        }
      };
    });
});
