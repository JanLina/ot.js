var TextOperation = require('../../lib/text-operation');
var Client = require('../../lib/client');

exports.testClient = function (test) {
  var client = new Client(1);
  test.strictEqual(client.revision, 1);
  test.ok(client.state instanceof Client.Synchronized);

  var sentRevision = null;
  var sentOperation = null;
  function getSentOperation () {
    var a = sentOperation;
    if (!a) { throw new Error("sendOperation wasn't called"); }
    sentOperation = null;
    return a;
  }
  function getSentRevision () {
    var a = sentRevision;
    if (typeof a !== 'number') { throw new Error("sendOperation wasn't called"); }
    sentRevision = null;
    return a;
  }
  client.sendOperation = function (revision, operation) {
    sentRevision = revision;
    sentOperation = operation;
  };

  var doc = "lorem dolor";
  var appliedOperation = null;
  function getAppliedOperation () {
    var a = appliedOperation;
    if (!a) { throw new Error("applyOperation wasn't called"); }
    appliedOperation = null;
    return a;
  }
  client.applyOperation = function (operation) {
    doc = operation.apply(doc);
    appliedOperation = operation;
  };

  // 将 client 的 operation 发送到 server
  function applyClient (operation) {
    doc = operation.apply(doc);
    client.applyClient(operation);
  }

  // Synchronized 状态下收到新的 server op
  // 直接应用 op 并 client.revision++
  console.log('\nSynchronized & applyServer');
  client.applyServer(new TextOperation().retain(6)['delete'](1).insert("D").retain(4));
  test.strictEqual(doc, "lorem Dolor");
  test.ok(client.state instanceof Client.Synchronized);
  test.strictEqual(client.revision, 2);

  // Synchronized 状态下产生了新的 client op
  // 将其发送给 server，状态变为 AwaitingConfirm
  applyClient(new TextOperation().retain(11).insert(" "));
  test.strictEqual(doc, "lorem Dolor ");
  test.ok(client.state instanceof Client.AwaitingConfirm);
  test.strictEqual(getSentRevision(), 2);
  test.ok(client.state.outstanding.equals(new TextOperation().retain(11).insert(" ")));
  test.ok(getSentOperation().equals(new TextOperation().retain(11).insert(" ")));

  // client 存在 sentOperation，又收到新的 server operation
  // 将 server op 和 sentOperation 进行 transform
  // server op' 应用到文档，sentOperation' 替换 sentOperation
  console.log('\nAwaitingConfirm & applyServer');
  client.applyServer(new TextOperation().retain(5).insert(" ").retain(6));
  test.strictEqual(doc, "lorem  Dolor ");
  test.strictEqual(client.revision, 3);
  test.ok(client.state instanceof Client.AwaitingConfirm);
  test.ok(client.state.outstanding.equals(new TextOperation().retain(12).insert(" ")));

  // client 方的缓冲
  // 存在 sentOperation，client 又产生了新的 operation(s)
  // 统一放到 buffer 缓冲起来，并且 state 变更为 AwaitingWithBuffer
  applyClient(new TextOperation().retain(13).insert("S"));
  test.ok(client.state instanceof Client.AwaitingWithBuffer);
  applyClient(new TextOperation().retain(14).insert("i"));
  applyClient(new TextOperation().retain(15).insert("t"));
  test.ok(!sentRevision && !sentOperation);
  test.strictEqual(doc, "lorem  Dolor Sit");
  test.ok(client.state.outstanding.equals(new TextOperation().retain(12).insert(" ")));  // 待 server 确认
  test.ok(client.state.buffer.equals(new TextOperation().retain(13).insert("Sit")));     // 缓冲区

  // client 又收到新的 server operation
  // 更新 sentOperation 和 buffer
  console.log('\nAwaitingWithBuffer & applyServer');
  client.applyServer(new TextOperation().retain(6).insert("Ipsum").retain(6));
  test.strictEqual(client.revision, 4);
  test.strictEqual(doc, "lorem Ipsum Dolor Sit");
  test.ok(client.state instanceof Client.AwaitingWithBuffer);
  test.ok(client.state.outstanding.equals(new TextOperation().retain(17).insert(" ")));
  test.ok(client.state.buffer.equals(new TextOperation().retain(18).insert("Sit")));

  // 收到 sentOperation 的 Ack 后
  // 发送 buffer 里的 operation
  client.serverAck();
  test.strictEqual(getSentRevision(), 5);
  test.ok(getSentOperation().equals(new TextOperation().retain(18).insert("Sit")));
  test.strictEqual(client.revision, 5);
  test.ok(client.state instanceof Client.AwaitingConfirm);
  test.ok(client.state.outstanding.equals(new TextOperation().retain(18).insert("Sit")));

  // 收到 buffer 的 Ack
  client.serverAck();
  test.strictEqual(client.revision, 6);
  test.ok(typeof sentRevision !== 'number');
  test.ok(client.state instanceof Client.Synchronized);
  test.strictEqual(doc, "lorem Ipsum Dolor Sit");

  // Test AwaitingConfirm and AwaitingWithBuffer resend operation.
  client.applyClient(new TextOperation().retain(21).insert("a"));
  test.ok(client.state instanceof Client.AwaitingConfirm);
  test.ok(!!client.state.resend);
  client.applyClient(new TextOperation().retain(22).insert("m"));
  test.ok(client.state instanceof Client.AwaitingWithBuffer);
  test.ok(!!client.state.resend);

  // 跟 server 的连接断开了，resend 重新发送未确认的 operation
  // 只有 AwaitingConfirm 和 AwaitingWithBuffer 状态有 resend 方法
  client.state.resend(client);
  test.ok(sentOperation.equals(new TextOperation().retain(21).insert('a')));
  client.serverAck();
  test.ok(sentOperation.equals(new TextOperation().retain(22).insert('m')));


  test.done();
};