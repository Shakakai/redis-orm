var redis = require('./node-redis/index.js');
var chain = require('./chain');

var client = null;

var get_client = exports.get_client = function(){
    return client;
};

/*************
 * Utilities
 ************/
var startup = exports.startup = function(port, host){
    client = redis.createClient(port, host);
};

var shutdown = exports.shutdown = function(){
    client.quit();
};

function guid(){
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        var r = Math.random()*16|0, v = c == 'x' ? r : (r&0x3|0x8);
        return v.toString(16);
    }).toUpperCase();
}

/***************
 * Core DB 
 **************/
var Query = function(modelType){
    var _filters = [], 
    _orderby = null, 
    _query_set = modelType._get_hashname();
    
    this.filter = function(filterType, value){
        var property = modelType.fields[filterType];
        if(filterType.indexOf("!") != -1){
            // select for not - then exclude "not items" from all results
        }
        else if(filterType.indexOf('>') != -1){
            // select for great than
        }
        else if(filterType.indexOf('<') != -1){
            // select for less than
        }else{
            if(property.data_type() == 'string'){
                _query_set = modelType._get_property_set(filterType, value);
            }
        }
        return this;
    };
    
    this.orderby = function(orderProp, direction){
        if(_orderby){
            console.log("Can only have one orderby statement in a query");
            throw new Error("Multiple orderby statements. prop: " + orderProp);
        }
        if(direction && !(direction == 'ASC' || direction == 'DESC')){
            console.log("orderby direction must be either ASC or DESC.");
            throw new Error("orderby direction is invalid. Must be either ASC or DESC.");
        }
        _orderby = {};
        _orderby.direction = (direction ? direction : 'ASC');
        _orderby.orderProp = orderProp;
        var sort_type = modelType.fields[orderProp].sort_type();
        if(sort_type){
            _orderby.type = sort_type;
        }
        return this;
    };
    
    var create_query = function(count, startIndex){
        var order;
        if(_orderby){
            order = '*->' + _orderby.orderProp;
        }else{
            order = 'nosort';
        }
        var query = [_query_set, 'BY', order, 'GET', '#'];
        for(var prop in modelType.fields){
            query.push('GET');
            query.push('*->' + prop);
        }
        // LIMIT and selection
        query.push('LIMIT');
        query.push(startIndex);
        query.push(count);
        
        // Sort type and direction
        if(_orderby){
            if(_orderby.type){
                query.push(_orderby.type);
            }
            query.push(_orderby.direction);
        }
        console.log(query);
        return query;
    };
    
    var process_models = function(objs, result){
        if(objs.length == 0){
            return result;
        }
        var key = objs.shift();
        var props = objs.slice(0, modelType.property_count);
        var inst = new modelType(key, props);
        result.push(inst);
        return process_models(objs.slice(modelType.property_count, objs.length), result);
    };
    
    this.fetch = function(count){
        var startIndex, callback;
        if(arguments.length == 2 && typeof(arguments[1]) == 'function'){
            startIndex = 0;
            callback = arguments[1];
        }else{
            startIndex = arguments[1];
            callback = arguments[2];
        }
        
        var query = create_query(count, startIndex);
        query.push(function(err, objs){
            if(err){
                callback(err);
                return;
            }
            if(objs.length == 0){
                console.log("data is empty array - check key");
                callback(err, objs);
            }

            console.log('IN ALL');
            console.log(objs);
            
            var models = process_models(objs, []);
            callback(err, models);
        });
        client.sort.apply(client, query);
    };
    
    this.count = function(){
        
    };
};

var Model = exports.Model = function(name, fields, actions){
    
    // class constructor
    var result = function(id, properties){
        this._source = {};
        this._original = {};
        if(arguments.length > 0){
            this._id = id;
            this._new = false;
            if(!properties){
                throw new Error("Existing objects instatiated with an id must include a property array.");
            }
            this.process_db_model(properties);
        }else{
            this._id = result._get_id_prefix() + guid();
            this._new = true;
            for(var prop in fields){
                this._source[prop] = fields[prop].default_value();
            }
        }
    };
    
    result.prototype.process_db_model = function(objs){
        console.log("objs", objs);
        for(var prop in fields){
            var raw_value = objs.shift();
            this._original[prop] = raw_value;
            var final_value = fields[prop].to_object(raw_value);
            console.log(prop, "RAW", raw_value, "FINAL", final_value);
            this._source[prop] = final_value;
        }
    };
    
    // closure to create getter-setters
    var create_getter_setter = function(prop){
        return function(){
            if(arguments.length == 1){//setter
                this._source[prop] = arguments[0];
            }else{//getter
                return this._source[prop];
            }
        };
    };
    
    /**
    * Class methods
    **/
    
    result._model_name = name;
    result.fields = fields;
    
    // pass redis values into instance variables
    result.objectify = function(key, data_array){
        var props = [];
        for(var field in fields){
            props.push(data_array[field]);
        }
        var a = new result(key, props);
        return a;
    };
    // convert to hashmap array for redis client
    result.to_redis_hash = function(instance){
        var redis_hash = {};
        for(var prop in fields){
            console.log('hashing prop:', prop);
            var object_value = instance._source[prop];
            var str_value = fields[prop].to_string(object_value);
            console.log('object value: ', object_value, 'string value: ', str_value);
            redis_hash[prop] = str_value;
        }
        return redis_hash;
    };
    // get a single object from redis
    result.get = function(key, callback){
        client.hgetall(key, function(err, d){
            if(err){
                callback(err);
                return;
            }
            callback(err,result.objectify(key, d));
        });
    }
    // retrieve all objects from redis
    result.all = function(){
        return new Query(result);
    };
    // delete a single object from redis
    result.delete = function(obj, callback){
        client.del(obj._id, function(err){
            if(!err) return callback(err);
            client.srem(result._get_hashname(), obj._id, callback);
        });
    }
    // delete all objects from redis
    result.deleteAll = function(callback){
        var delete_items = [result._get_hashname()];
        client.keys(result._get_id_prefix() + "*", function(err, keys){
            if(err) return callback(err);
            delete_items = delete_items.concat(keys);
            client.keys(result._get_property_prefix() + "*", function(err, keys){
                if(err) return callback(err);
                delete_items = delete_items.concat(keys);
                delete_items.push(callback);
                client.del.apply(client, delete_items);
            });
        });
    }
    // get total count of objects
    result.count = function(callback){
        client.scard(result._get_hashname(), callback)
    };
    
    result._get_hashname = function(){
        return "class-set:" + result._model_name;
    };
    result._get_id_prefix = function(){
        return "object:" + result._model_name + ":";
    };
    result._get_property_prefix = function(){
        return "property:" + result._model_name;
    };
    result._get_property_set = function(prop, value){
        return result._get_property_prefix() + ":" + prop + ":" + value;
    };
    
    /**
    * Instance methods 
    **/
    
    // create accessors for class properties
    result.prototype._source = null;
    result.prototype._original = null;
    result.property_count = 0;
    for(var prop in fields){
        result.prototype[prop] = create_getter_setter(prop);
        result.property_count++;
    }
    // validate instance before saving
    result.prototype.validate = function(){
        for(var prop in fields){
            console.log('Validating property: ' + prop);
            if(!fields[prop].validate(this._source[prop])){
                return false;
            }
        }
        return true;
    };
    // save instance to redis
    result.prototype.save = function(callback){
        if(!callback){
            callback = function(){};
        }
        //do presave action
        if(actions && actions.before_save){
            actions.before_save.apply(this);
        }
        
        //validate first
        if(!this.validate()){
            callback('Invalid object');
            return;
        }
        
        console.log('set model');
        var orig_hash = this._original;
        var redis_hash = result.to_redis_hash(this);
        var id = this._id;
        var is_new = this._new;
        console.log('REDIS HASH', redis_hash);
        client.hmset(id, redis_hash, function(err){
            if(!err){
                //add to master class hash
                console.log("BEFORE NEW >>", is_new);
                if(is_new){
                    console.log('add model to hash >> ' + result._model_name + ' - ' + id);
                    client.sadd(result._get_hashname(), id, function(err){
                        if(err){
                            console.log("Error hashing new object >> " + err);
                        }
                        // Create filter lookups
                        var ready = false;
                        var hold_count = 0;
                        var has_filterable = false;
                        for(var prop in fields){
                            if(fields[prop].is_filterable()){
                                has_filterable = true;
                                hold_count++;
                                console.log("add filter attr", prop);
                                client.sadd(result._get_property_set(prop, redis_hash[prop]), id, function(err){
                                    hold_count--;
                                    if(ready && hold_count == 0){
                                        callback(err);
                                    }
                                });
                            }
                        }
                        console.log("after adding filter attrs");
                        ready = true;
                        if(!has_filterable){
                            callback(err);
                        }
                    });
                }else{
                    var ready = false;
                    var hold_count = 0;
                    for(var prop in fields){
                        // Value changed - Update hashes
                        if(fields[prop].is_filterable() && orig_hash[prop] != redis_hash[prop]){
                            hold_count++;
                            client.sadd(result._get_property_set(prop, redis_hash[prop]), id, function(err){
                                if(err) return;
                                client.srem(result._get_property_set(prop, orig_hash[prop]), id, function(err){
                                    if(err) return;
                                    hold_count--;
                                    if(ready && hold_count == 0){
                                        callback(err);
                                    }
                                });
                            });
                        }
                    }
                    ready = true;
                }
            }else{
                console.log("Error saving object >> ", err);
                callback(err);
            }
        });
    }
    // delete instance from redis
    result.prototype.delete = function(callback){
        result.delete(this, callback);
    };
    
    result.prototype._get_property_hashname = function(propname){
        return "prophash:" + propname +":" + this._id;
    }
    
    return result;
};

var Property = function(options){
    //provide defaults
    if(!options.required){
        options.required = false;
    }
    if(!options.sortable){
        options.sortable = false;
    }
    
    return {
        data_type : function(){ return options.type; },
        validate : options.validation(options),
        default_value : options.default_value(options),
        is_sortable : function(){ return options.sortable; },
        is_filterable : function(){ return options.filterable; },
        to_string : options.to_string,
        to_object : options.to_object,
        sort_type : options.sort_type
    };
};

var StringProperty = exports.StringProperty = function(options){
    options.type = 'string';
    options.validation = function(opts){
        return function(value){
            //make sure its non-null
            if(opts.required && !value){
                console.log('validation failed in required: ' + value);
                return false;
            }
            //make sure its a string
            if(value && typeof(value) != 'string'){
                console.log('validation failed in type check: ' + typeof(value));
                return false
            }
            console.log('validation successful');
            return true;
        };
    };
    options.default_value = function(opts){
        if(opts.default){
            return function(){ return opts.default; };
        }else{
            return function(){ return null; };
        }
    };
    options.to_string = function(value){ return value; };
    options.to_object = function(value){ return value; };
    options.sort_type = function(){ return 'ALPHA'};
    return Property(options);
};

var DateProperty = exports.DateProperty = function(options){
    options.type = 'date';
    options.validation = function(opts){
        return function(value){
            //make sure its non-null
            if(opts.required && !value){
                console.log('validation failed in required: ' + value);
                return false;
            }
            //make sure its a date
            if(value && typeof(value) != typeof(new Date())){
                console.log('validation failed in type check: ' + typeof(value));
                return false
            }
            console.log('validation successful');
            return true;
        };
    };
    options.default_value = function(opts){
        if(opts.default){
            if(opts.default == 'now'){
                return function(){ return new Date(); };
            }else{
                return function(){ return opts.default; };
            }
        }else{
            return function(){ return null; };
        }
    };
    options.to_string = function(value){ return value.getTime().toString(); };
    options.to_object = function(value){ return new Date(parseInt(value)); };
    options.sort_type = function(){ return null};//numeric is default sort type
    return Property(options);
};







