


var chain = exports.chain = function(func, contexto){
    var func_list = [];
    var context_list = [];
    var create_context = function(nx, cx){
        if(!cx){
            cx = {};
        }
        if(nx){
            cx.next = nx;
        }
        cx.bind = function(f){
            return function(){
                return f.apply(cx, arguments);
            };
        };
        return cx;
    };
    var wrap = function(f, context){
        return function(){
            return f.apply(context, arguments);
        };
    };
    var next = function(func, context){
        func_list.push(func);
        context_list.push(context);
        return this;
    };
    
    if(arguments.length>0){
        next.call(this,func,contexto);
    }
    
    return {
        next : next,
        execute : function(){
            var f;
            while(func_list.length>0){
                //create context
                var context = create_context(f, context_list[func_list.length-1]);
                f = wrap(func_list.pop(), context);
            }
            return f();
        }
    };
};

