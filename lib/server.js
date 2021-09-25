if (typeof ot === 'undefined') {
  var ot = {};
}

ot.Server = (function (global) {
  'use strict';

  // Constructor. Takes the current document as a string and optionally the array
  // of all operations.
  function Server (document, operations) {
    this.document = document;            // 文档内容，这是一段纯文本字符串
    this.operations = operations || [];  // 文档编辑历史记录，这是一个保存 operation 的数组
  }

  // Call this method whenever you receive an operation from a client.
  // @params revision：client 的此次 operation 是基于哪个版本
  Server.prototype.receiveOperation = function (revision, operation) {
    // 检查 revision
    if (revision < 0 || this.operations.length < revision) {
      throw new Error("operation revision not in history");
    }
    // Find all operations that the client didn't know of when it sent the
    // operation ...
    var concurrentOperations = this.operations.slice(revision);

    // ... and transform the operation against all these operations ...
    // 将 operation 基于 concurrentOperations 做转换
    var transform = operation.constructor.transform;
    for (var i = 0; i < concurrentOperations.length; i++) {
      operation = transform(operation, concurrentOperations[i])[0];
    }

    // ... and apply that on the document.
    this.document = operation.apply(this.document);
    // Store operation in history.
    this.operations.push(operation);

    // It's the caller's responsibility to send the operation to all connected
    // clients and an acknowledgement to the creator.
    // TODO 是怎么发送给所有在线 client 的？
    return operation;
  };

  return Server;

}(this));

if (typeof module === 'object') {
  module.exports = ot.Server;
}