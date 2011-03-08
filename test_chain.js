var chain = require('./chain').chain;
var assert = require('assert');

var c = chain();
c.next(function(){
    console.log('1');
    this.next();
}).next(function(){
    console.log('2');
}).execute();

var c = chain();
c.next(function(){
    console.log(this.msg);
    this.next();
}, {msg: 'hello chain!'}).next(function(){
    console.log('end');
}).execute();

var c = chain();
c.next(function(){
    var f = function(){
        console.log(this.msg);
        this.next();
    };
    this.bind(f)();
}, {msg: 'hello chain!'}).next(function(){
    console.log('end');
}).execute();

var c = chain(function(){
    console.log(1);
    this.next();
});
c.next(function(){
    console.log(2);
}).execute();
