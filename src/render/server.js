// server side rendering for regularjs


var _ = require('../util');
var parser = require('../helper/parse');
var diffArray = require('../helper/diff').diffArray;




// hogan
// https://github.com/twitter/hogan.js
// MIT
var escape = (function(){
  var rAmp = /&/g,
      rLt = /</g,
      rGt = />/g,
      rApos = /\'/g,
      rQuot = /\"/g,
      hChars = /[&<>\"\']/;

  function ignoreNullVal(val) {
    return String((val === undefined || val == null) ? '' : val);
  }

  return function (str) {
    str = ignoreNullVal(str);
    return hChars.test(str) ?
      str
        .replace(rAmp, '&amp;')
        .replace(rLt, '&lt;')
        .replace(rGt, '&gt;')
        .replace(rApos, '&#39;')
        .replace(rQuot, '&quot;') :
      str;
  }

})();

/**
 * [compile description]
 * @param  {[type]} ast     [description]
 * @param  {[type]} options [description]
 */




function SSR (Component, definition){

  definition = definition || {};

  this.Component = Component;
  var context = this.context = Object.create(Component.prototype)


  

}


var ssr = _.extend(SSR.prototype, {});


ssr.render = function(){

  var self = this;
  return this.compile(this.context.template);

}

ssr.compile = function(ast){

  if(typeof ast === 'string'){
    ast = parser.parse(ast);
  }
  return this.walk(ast)
}


ssr.walk = function(ast, options){

  var type = ast.type; 

  if(Array.isArray(ast)){

    return ast.map(function(item){

      return this.walk(item, options)

    }.bind(this)).join('');

  }

  return this[ast.type](ast, options)

}


ssr.element = function(ast ){

  var children = ast.children,
    attrs = ast.attrs,
    tag = ast.tag;

  if( tag === 'r-component' ){
    attrs.some(function(attr){
      if(attr.name === 'is'){
        tag = attr.value;
        if( _.isExpr(attr.value)) tag = this.get(attr.value);
        return true;
      }
    }.bind(this))
  }

  var Component = this.Component.component(tag);

  if(ast.tag === 'r-component' && !Component){
    throw Error('r-component with unregister component ' + tag)
  }

  if( Component ) return this.component( ast, { 
    Component: Component 
  } );


  var attrStr = this.attrs(attrs);
  var body = (children && children.length? this.compile(children): "")

  return "<" + tag + (attrStr? " " + attrStr: ""  ) + ">" +  
        body +
    "</" + tag + ">"

}



ssr.component = function(ast, options){

  var children = ast.children,
    attrs = ast.attrs,
    data = {},
    Component = options.Component, body;

  if(children && children.length){
    body = function(){
      return this.compile(children)
    }.bind(this)
  }

  attrs.forEach(function(attr){
    if(!_.eventReg.test(attr.name)){
      data[attr.name] = _.isExpr(attr.value)? this.get(attr.value): attr.value
    }
  }.bind(this))


  return SSR.render(Component, {
    $body: body,
    data: data,
    extra: this.extra
  })
}



ssr.list = function(ast){

  var 
    alternate = ast.alternate,
    variable = ast.variable,
    indexName = variable + '_index',
    keyName = variable + '_key',
    body = ast.body,
    context = this.context,
    self = this,
    prevExtra = context.extra;

  var sequence = this.get(ast.sequence);
  var keys, list; 

  var type = _.typeOf(sequence);

  if( type === 'object'){

    keys = Object.keys(list);
    list = keys.map(function(key){return sequence[key]})

  }else{

    list = sequence || [];

  }

  return list.map(function(item, item_index){

    var sectionData = {};
    sectionData[variable] = item;
    sectionData[indexName] = item_index;
    if(keys) sectionData[keyName] = sequence[item_index];
    context.extra = _.extend(
      prevExtra? Object.create(prevExtra): {}, sectionData );
    var section =  this.compile( body );
    context.extra = prevExtra;
    return section;

  }.bind(this)).join('');

}




// {#include } or {#inc template}
ssr.template = function(ast, options){
  var content = this.get(ast.content);
  var type = typeof content;


  if(!content) return '';
  if(type === 'function' ){
    return content();
  }else{
    return this.compile(type !== 'object'? String(content): content)
  }

};

ssr.if = function(ast, options){
  var test = this.get(ast.test);  
  if(test){
    if(ast.consequent){
      return this.compile( ast.consequent );
    }
  }else{
    if(ast.alternate){
      return this.compile( ast.alternate );
    }
  }

}


ssr.expression = function(ast, options){
  var str = this.get(ast);
  return escape(str);
}

ssr.text = function(ast, options){
  return escape(ast.text) 
}



ssr.attrs = function(attrs){
  return attrs.map(function(attr){
    return this.attr(attr);
  }.bind(this)).join("").replace(/\s+$/,"");
}

ssr.attr = function(attr){

  var name = attr.name, 
    value = attr.value || "",
    Component = this.Component,
    directive = Component.directive(name);

  

  if( directive ){
    if(directive.ssr){

      // @TODO: 应该提供hook可以控制节点内部  ,比如r-html
      return directive.ssr( name, _.isExpr(value)? this.get(value): '' );
    }
  }else{
    // @TODO 对于boolean 值
    if(_.isExpr(value)) value = this.get(value); 
    if(_.isBooleanAttr(name) || value === undefined || value === null){
      return name + " ";
    }else{
      return name + '="' + escape(value) + '" ';
    }
  }
}

ssr.get = function(expr){

  var rawget, 
    self = this,
    context = this.context,
    touched = {};

  if(expr.get) return expr.get(context);
  else {
    var rawget = new Function(_.ctxName, _.extName , _.prefix+ "return (" + expr.body + ")")
    expr.get = function(context){
      return rawget(context, context.extra)
    }
    return expr.get(this.context)
  }

}

SSR.render = function(Component, options){

  return new SSR(Component, options).render();

}

SSR.escape = escape;

module.exports = SSR;