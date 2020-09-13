import * as ToyReact from "./Toy-react";

class MyComponent extends ToyReact.Component {
  render() {
    return (
      <div>
        <h1>My Component </h1>
        {this.children}
      </div>
    );
  }
}

ToyReact.render(
  <MyComponent id="testJSX" class="test-jsx">
    <div>abc</div>
    <div></div>
    <div></div>
    <div></div>
  </MyComponent>,
  document.body
);
