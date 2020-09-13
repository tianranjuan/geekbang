import { isString, isArray } from "lodash";

/**
 * 代理原生setAttribute和appendChild方法
 *  */
class ElementComponentWrapper {
  constructor(type) {
    this.root = document.createElement(type);
  }
  setAttribute(name, value) {
    this.root.setAttribute(name, value);
  }
  appendChild(component) {
    this.root.appendChild(component.root);
  }
}

/**
 * 代理原生TextNode
 * 没有属性，没有子节点，只有被当做子节点插入的份儿
 */
class TextNodeComponentWrapper {
  constructor(content) {
    this.root = document.createTextNode(content);
  }
}

/**
 * 自定义组件实现
 * 模拟实现children，attribute(props属性模拟)
 * 通过root的getter吊桶render方法模拟实现创建一个dom，实质是调用了createElement方法把所有节点转换为element代理组件和TextNode代理组件
 */
export class Component {
  constructor() {
    this.props = Object.create(null);
    this.children = [];
    this._root = null;
  }

  setAttribute(name, value) {
    this.props[name] = value;
  }
  appendChild(component) {
    this.children.push(component);
  }

  get root() {
    if (!this._root) {
      this._root = this.render().root;
    }
    return this._root;
  }
}

// 节点类型， 属性， 子节点
// 作用是组装返回一个dom元素
export const createElement = function (type, attributes, ...children) {
  let e;
  if (isString(type)) {
    // 处理原生类型
    e = new ElementComponentWrapper(type);
  } else {
    // 处理自定义类型
    e = new type();
  }
  // 挂在属性到组件实例
  for (const attr in attributes) {
    e.setAttribute(attr, attributes[attr]);
  }

  // 当包自定义Component组件含子节点时由于子节点，所以字节点的类型也是需要进行解析的，而子节点可能是数组所以需要展开，同时考虑到数组嵌套的情况所以使用递归的方式进行展开
  // 目的把所有的子组件转化为ElementComponentWrapper类型组件或TextNodeComponentWrapper类型组件(也就是转化为真实dom)
  let insertChildren = (children) => {
    for (const child of children) {
      // 考虑到文本节点的情况
      if (isString(child)) {
        child = new TextNodeComponentWrapper(child);
      }

      if (isArray(child)) {
        insertChildren(child);
      } else {
        e.appendChild(child);
      }
    }
  };
  // 开始递归解析子节点
  insertChildren(children);
  return e;
};

export const render = function (component, parentElement) {
  // 由于使用的是真实dom节点所以实现起来很简单直接插入即可
  parentElement.appendChild(component.root);
};
