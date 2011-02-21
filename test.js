var db = require('./db'),
assert = require("assert"),
chain = require('./chain').chain;

var REDIS_PORT = 6379;
var REDIS_HOST = "127.0.0.1";
var client;
var tests = {};
var test_order = [];
var success = 0;
var failure = 0;

/***********
 *  Utilities
 ***********/
function setup(){
 db.startup(REDIS_PORT, REDIS_HOST);
 client = db.get_client();
}

function cleanup(){
 console.log('________ STARTING CLEANUP ___________');
 client.keys("*", function(err, keys){
     var len = keys.length;
     if(len ==0 ){
         return run_next_test();
     }
     keys.forEach(function(key){
         client.del(key, function(err){
             console.log('XXXXXXXXX  CLEANED');
             len--;
             if(len==0){
                 run_next_test();
             }
         });
     });
 });
}

function run_tests(){
    setup();
    for(prop in tests){
        test_order.push(prop);
    }
    console.log('TEST ORDER', test_order);
    cleanup();
}

function run_next_test(){
    console.log('---------- RUNNING NEXT TEST -----------');
    if(test_order.length==0){
        console.log('***************** COMPLETED TESTS *****************');
        return;
    }
    
    var test_name = test_order.shift();
    console.log('++++++++++++++++ RUNNING TEST >>', test_name);
    tests[test_name]();
}


/********
    Setup Models
********/

var User = db.Model('User', {
    'username' : db.StringProperty({
        'sortable' : true,
        'filterable' : true,
        'required' : true
    }),
    'password' : db.StringProperty({
        'sortable' : false,
        'filterable' : true,
        'required' : true
    })
});

/**********
 * Tests
 **********/

tests.save = function(){
    var b = new User();
    b.username('andrew');
    b.password('god');
    b.save(function(err){
        assert.equal(true,!err, "Save caused an error");
        User.get(b._id, function(err, user){
            assert.equal(true,!err, "Get after save caused an error");
            assert.equal(user.username(), b.username(), 'User does not have the correct name');
            assert.equal(user.password(), b.password(), 'User does not have the correct password');
            cleanup();
        });
    });
}

tests.get = function(){
    var a = new User();
    a.username('andrew');
    a.password('god');
    a.save();
    
    User.get(a._id, function(err, user){
        assert.equal(true,!err, "Get caused an error");
        assert.equal(a._id, user._id, "User does not have same id as query");
        assert.equal(user.username(), a.username(), 'User does not have the correct name > ' + user.username());
        assert.equal(user.password(), a.password(), 'User does not have the correct password');
        cleanup();
    });
};

tests.all = function(){
    var andrew, todd, chris;
    chain(function(){
        andrew = new User();
        andrew.username('andrew');
        andrew.password('god');
        andrew.save(this.next);
    }).next(function(err){
        assert.equal(true,!err, "Error in filter_all call");
        chris = new User();
        chris.username('chris');
        chris.password('secret');
        chris.save(this.next);
    }).next(function(err){
        todd = new User();
        todd.username('todd');
        todd.password('test test');
        todd.save(this.next);
    }).next(function(err){
        assert.equal(true,!err, "Error in User.all call");
        User.all().orderby('username', 'DESC').fetch(10, function(err, results){
            assert.equal(true,!err, "Error in User.all call");
            assert.equal(results.length, 3, "Should have found 3 users, instead > " + results.length);
            assert.equal(results[0].username(), todd.username(), "Username is not correct in User.all call");
            assert.equal(results[2].password(), andrew.password(), "Password is not correct in User.all call");
            cleanup();
        });
    }).execute();
};

tests.filter_all = function(){
    var andrew, todd, chris;
    chain(function(){
        andrew = new User();
        andrew.username('andrew');
        andrew.password('god');
        andrew.save(this.next);
    }).next(function(err){
        assert.equal(true,!err, "Error in filter_all call");
        chris = new User();
        chris.username('chris');
        chris.password('secret');
        chris.save(this.next);
    }).next(function(err){
        todd = new User();
        todd.username('todd');
        todd.password('test test');
        todd.save(this.next);
    }).next(function(err){
        assert.equal(true,!err, "Error in filter_all call");
        User.all().filter('username', 'andrew').filter('password', 'god').orderby('username', 'DESC').fetch(10, function(err, results){
            assert.equal(true,!err, "Error in filter_all call");
            assert.equal(results.length, 1, "Should have found 1 user, instead > " + results.length);
            assert.equal(results[0].username(), andrew.username(), "Username is not correct in filter_all call");
            assert.equal(results[0].password(), andrew.password(), "Password is not correct in filter_all call");
            cleanup();
        });
    }).execute();
};



run_tests();
