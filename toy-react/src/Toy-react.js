import { isString, isArray, isObject, isNull } from "lodash";

const RENDER_TO_DOM = Symbol("render to dom");

/**
 * 代理原生setAttribute和appendChild方法
 *  */
class ElementComponentWrapper {
  constructor(type) {
    this.root = document.createElement(type);
  }
  setAttribute(name, value) {
    // 过滤是否是事件并绑定
    if (name.match(/^on([\s\S]+)$/)) {
      // 由于某些事件大小写敏感所以全部转换成小写
      this.root.addEventListener(
        RegExp.$1.replace(/^[\s\S]/, (c) => c.toLowerCase()),
        value
      );
    } else {
      if (name === "className") {
        name = "class";
      }
      this.root.setAttribute(name, value);
    }
  }
  appendChild(component) {
    let range = document.createRange();
    range.setStart(this.root, this.root.childNodes.length);
    range.setEnd(this.root, this.root.childNodes.length);
    component[RENDER_TO_DOM](range);
  }
  [RENDER_TO_DOM](range) {
    range.deleteContents();
    range.insertNode(this.root);
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
  [RENDER_TO_DOM](range) {
    range.deleteContents();
    range.insertNode(this.root);
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
    this._range = null;
  }

  setAttribute(name, value) {
    this.props[name] = value;
  }
  appendChild(component) {
    this.children.push(component);
  }
  /**
   * 转换思路不再使用直接操作dom的模式
   * 使用range来获取dom帧然后进行组件的渲染和State的更新
   * @param {} range
   */
  [RENDER_TO_DOM](range) {
    this._range = range;
    this.render()[RENDER_TO_DOM](range);
  }

  rerender() {
    let oldRange = this._range;

    let range = document.createRange();
    range.setStart(oldRange.startContainer, oldRange.startOffset);
    range.setEnd(oldRange.startContainer, oldRange.startOffset);
    this[RENDER_TO_DOM](range);
    oldRange.setStart(range.endContainer, range.endOffset);
    oldRange.deleteContents();
  }

  /**
   * State -> 实质上就是一个贫血模型的简单对象模型
   * 难点： 如何SetState 重新设置State后如何正确刷新模板
   */

  setState(newState) {
    // 如果当前没有state那么将state设置为新传入的state并在重绘后return
    if (isNull(this.state) || !isObject(this.state)) {
      this.state = newState;
      this.rerender();
      return;
    }
    let merge = (oldState, newState) => {
      for (const p in newState) {
        if (isNull(oldState[p]) || !isObject(oldState[p])) {
          oldState[p] = newState[p];
        } else {
          merge(oldState[p], newState[p]);
        }
      }
    };

    merge(this.state, newState);
    this.rerender();
  }

  // get root() {
  //   if (!this._root) {
  //     this._root = this.render().root;
  //   }
  //   return this._root;
  // }
}

// 节点类型， 属性， 子节点
// 作用是解析jsx并组装返回一个dom元素
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
      if (child === null) {
        continue;
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

/**
 * 渲染整个ui组件树到容器元素中
 * @param {*} component //根组件
 * @param {*} parentElement  //容器元素
 */
export const render = function (component, parentElement) {
  // 由于使用的是真实dom节点所以实现起来很简单直接插入即可
  // parentElement.appendChild(component.root);
  // 使用range实现
  let range = document.createRange();
  range.setStart(parentElement, 0);
  range.setEnd(parentElement, parentElement.childNodes.length);
  range.deleteContents();

  component[RENDER_TO_DOM](range);
};
