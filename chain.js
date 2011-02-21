


var chain = exports.chain = function(func){
    var func_list = [func];
    var create_context = function(f){
        return {
            'next' : f
        };
    };
    var wrap = function(f, context){
        return function(){
            return f.apply(context, arguments);
        };
    };
    return {
        next : function(func){
            func_list.push(func);
            return this;
        },
        execute : function(){
            var f;
            while(func_list.length>0){
                if(f){
                    //create context
                    var context = create_context(f);
                }
                f = func_list.pop();
                if(context){
                    f = wrap(f, context);
                }
            }
            return f();
        }
    };
};

