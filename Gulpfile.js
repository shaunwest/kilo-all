/**
 * Created by Shaun on 11/13/2014.
 */

var gulp = require('gulp');
var concat = require('gulp-concat');
var uglify = require('gulp-uglify');
var rename = require('gulp-rename');
//var karma = require('karma').server;
var runSequence = require('run-sequence');
var clean = require('gulp-clean');
//var karmaConfig = __dirname + '/karma.conf.js';
var jsSources = [
  'bower_components/kilo/src/kilo.js',
  'bower_components/kilo-extra/src/**/*.js',
  'bower_components/kilo-scheduler/src/**/*.js',
  'bower_components/kilo-flow/src/**/*.js'
];

gulp.task('clean', function() {
  return gulp.src('dist', {read: false})
    .pipe(clean());
});

gulp.task('build', function() {
  return gulp.src(jsSources)
    .pipe(concat('kilo-all.js'))
    .pipe(gulp.dest('dist'))
    .pipe(uglify())
    .pipe(rename('kilo-all.min.js'))
    .pipe(gulp.dest('dist'));
});

gulp.task('node-build', function() {
  var sources = jsSources.concat('src/node.js');
  return gulp.src(sources)
    .pipe(concat('kilo-all-node.js'))
    .pipe(gulp.dest('dist'))
    .pipe(uglify())
    .pipe(rename('kilo-all-node.min.js'))
    .pipe(gulp.dest('dist'));
});
/*gulp.task('test', function(cb) {
  return karma.start({
    configFile: karmaConfig,
    singleRun: true
  }, cb);
});*/

//gulp.task('watch', function() {
//  return gulp.watch('src/**/*.js', ['build']);
//});

/*gulp.task('ci', function(cb) {
  return karma.start({
    configFile: karmaConfig
  }, cb);
});*/

gulp.task('default', function(cb) {
  runSequence('clean', 'build', cb);
});
