import { isString, isArray, isObject, isNull, last } from "lodash";

const RENDER_TO_DOM = Symbol("render to dom");

function replaceContent(range, node) {
  range.insertNode(node);
  range.setStartAfter(node);
  range.deleteContents();

  range.setStartBefore(node);
  range.setEndAfter(node);
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
  get vdom() {
    return this.render().vdom;
  }

  // get vchildren() {
  //   return this.children.map((child) => child.vdom);
  // }

  /**
   * 转换思路不再使用直接操作dom的模式
   * 使用range来获取dom帧然后进行组件的渲染和State的更新
   * @param {} range
   */
  [RENDER_TO_DOM](range) {
    this._range = range;
    this._vdom = this.vdom; // 绘制前缓存下旧的vdom树
    this._vdom[RENDER_TO_DOM](range); // 让旧的vdom去执行渲染为实体dom的操作
  }

  update() {
    let isSameNode = (oldNode, newNode) => {
      if (oldNode.type !== newNode.type) {
        return false;
      }

      for (let name in newNode.props) {
        if (newNode.props[name] !== oldNode.props[name]) {
          return false;
        }
      }

      if (
        Object.keys(oldNode.props).length > Object.keys(newNode.props).length
      ) {
        return false;
      }

      if (newNode.type === "text") {
        if (newNode.content !== oldNode.content) {
          return false;
        }
      }
      return true;
    };
    let update = (oldNode, newNode) => {
      // 如果是不同节点则将newNode填充新oldNode的range中
      if (!isSameNode(oldNode, newNode)) {
        newNode[RENDER_TO_DOM](oldNode._range);
        return;
      }
      newNode._range = oldNode._range; // 将newNode的range（位置信息）设置为oldNode的

      let newChildren = newNode.vchildren;
      let oldChildren = oldNode.vchildren;

      if (!newChildren || !newChildren.length) {
        return;
      }

      let tailRange = last(oldChildren)._range;

      for (let i = 0; i < newChildren.length; i++) {
        let newChild = newChildren[i];
        let oldChild = oldChildren[i];

        if (i < oldChildren.length) {
          // 如果新节点的子节点数比旧的少时
          update(oldChild, newChild);
        } else {
          let range = document.createRange();
          range.setStart(tailRange.endContainer, tailRange.endOffset);
          range.setEnd(tailRange.endContainer, tailRange.endOffset);
          newChild[RENDER_TO_DOM](range);
          tailRange = range;
          // TODO
        }
      }
    };

    let vdom = this.vdom; // 对比前缓存vdom树
    update(this._vdom, vdom); // 进行对比更新
    this._vdom = vdom; // 替换旧_vdom为vdom进行更新后的缓存
  }

  /**
   * State -> 实质上就是一个贫血模型的简单对象模型
   * 难点： 如何SetState 重新设置State后如何正确刷新模板
   */

  setState(newState) {
    // 如果当前没有state那么将state设置为新传入的state并在重绘后return
    if (isNull(this.state) || !isObject(this.state)) {
      this.state = newState;
      this.update();
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
    this.update();
  }
}

/**
 * 代理原生setAttribute和appendChild方法
 *  */
class ElementComponentWrapper extends Component {
  constructor(type) {
    super(type);
    this.type = type;
  }

  get vdom() {
    this.vchildren = this.children.map((child) => child.vdom);
    return this;
  }
  [RENDER_TO_DOM](range) {
    this._range = range;

    let root = document.createElement(this.type);

    // 转写vdom属性到实体dom
    for (let name in this.props) {
      let value = this.props[name];
      // 过滤是否是事件并绑定
      if (name.match(/^on([\s\S]+)$/)) {
        // 由于某些事件大小写敏感所以全部转换成小写
        root.addEventListener(
          RegExp.$1.replace(/^[\s\S]/, (c) => c.toLowerCase()),
          value
        );
      } else {
        if (name === "className") {
          name = "class";
        }
        root.setAttribute(name, value);
      }
    }
    if (!this.vchildren)
      this.vchildren = this.children.map((child) => child.vdom);
    for (let child of this.vchildren) {
      let childRange = document.createRange();
      childRange.setStart(root, root.childNodes.length);
      childRange.setEnd(root, root.childNodes.length);
      child[RENDER_TO_DOM](childRange);
    }
    replaceContent(range, root);
  }
}

/**
 * 代理原生TextNode
 * 没有属性，没有子节点，只有被当做子节点插入的份儿
 */
class TextNodeComponentWrapper extends Component {
  constructor(content) {
    super(content);
    this.type = "#text";
    this.content = content;
  }
  get vdom() {
    return this;
  }

  [RENDER_TO_DOM](range) {
    this._range = range;
    let root = document.createTextNode(this.content);
    replaceContent(range, root);
  }
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
  for (let attr in attributes) {
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

/**
 * day 03 实现虚拟dom
 *
 * 步骤1：
 *  设置属性vdom并添加getter方法
 *  把textwrapper和elementwrapper统一成component类型
 *  注释掉elementwrapper注释掉的setAttribute和appendChildren逻辑，理由是转换为了component类型所以使用component的默认实现即可
 * 步骤2：
 *  虚拟dom转换为实体dom
 *  此时把之前elementwrapper注释掉的setAttribute和appendChildren的逻辑迁移到RENDER_TO_DOM中
 *  同时由于不需要使用实体dom所以也就删除掉了this.root属性
 * 步骤3：
 *  rerender光荣下岗，update光荣上岗
 *  对比逻辑（简化版）：
 *    type不相同则为不相同节点，从根节点替换
 *    props不相同则为不相同
 *    props数量不一致则为不相同
 *    #text类型时比对content是否相同
 *  update逻辑：
 *  1. 缓存下range到_range，方便后面是不同节点时可以将newNode覆盖渲染到oldNode的range中
 *  2. 在RENDER_TO_DOM方法中，缓存下当前使用的vdom到_vdom中，并使用_vdom去渲染成真是的dom
 *  3. 如果是相同节点，则强制覆盖newNode的内容渲染到oldNode的range上
 *  4. 如果不相同，将newNode的range（位置信息）设置为oldNode的，目的是等下次渲染时oldNode的range中渲染的是newNode的内容
 *  5. 递归对比子节点
 *      之前是使用component对象实现的children并不是vdom是不合适的，所以需要提供vchildren属性
 *      由于vdom是由vdom的getter获取出来的，所以需要在vdom的getter逻辑中添加vchildren实现逻辑
 */
