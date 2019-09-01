'use strict';

var expect = require('chai').expect;
var MongoClient = require('mongodb');
var objectId = MongoClient.ObjectId;

var dbCon;

function connectToDb() {
  if (!dbCon) {
    dbCon = MongoClient.connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true });
  }
  return dbCon;
}

module.exports = function (app) {
  
  app.route('/api/threads/:board')
    .post((req, res) => {
      let { board } = req.params;
      let { delete_password, text } = req.body;
    
      connectToDb()
        .then((dbCon) => {
          let db = dbCon.db('message-board');
          let _id = new objectId();
          let created_on = new Date();
          let bumped_on = created_on;
          let reported = false;
          let replies = [];
          let thread = { _id, text, created_on, bumped_on, reported, replies, delete_password };
          
          db.collection('boards').findOneAndUpdate(
            { board },
            { $push: {threads: thread} },
            { upsert : true}
          )
          .then(() => res.redirect(`/b/${board}`))
          .catch(err => console.log('Error : ' + err));
        }
      )
    })
  
    .put((req, res) => {
      let { board } = req.params;
      let { thread_id } = req.body;
    
      connectToDb()
        .then((dbCon) => {
          let db = dbCon.db('message-board');
          db.collection('boards').findOneAndUpdate(
            { board, 'threads._id': thread_id },
            { $set: {'threads.$.reported': true} }
          )
          .then(doc => (doc.value === null) ? res.send('Thread not found') : res.send('success'))
          .catch(err => console.log('Error : ' + err));
        }
      )
    })
    
    .delete((req, res) => {
      let { board } = req.params;
      let { thread_id, delete_password } = req.body;
    
      connectToDb()
        .then((dbCon) => {
          let db = dbCon.db('message-board');
          db.collection('boards').updateOne(
            { board },
            { $pull: {threads: {_id: objectId(thread_id), delete_password}} }
          )
          .then(doc => (doc.result.nModified === 0) ? res.send('incorrect password'): res.send('success'))
          .catch(err => console.log('Error : ' + err));
        }
      )
    })
    
    .get((req, res) => {
      let { board } = req.params;
      
      connectToDb()
      .then(dbCon => {
        let db = dbCon.db('message-board');
        db.collection('boards').findOne({ board }).then(board => {
          if(board == null) {
            return res.status(404).send('Board not found');
          }
          
          let { threads: allThreads } = board;
          console.log(allThreads);
          if(!allThreads || allThreads.length === 0) return res.send('Threads not found');
          let threads = allThreads
                        .sort((a,b) => a.bumped_on - b.bumped_on)
                        .slice(0,10)
                        .map((thread) => {
                          var {
                            bumped_on, created_on, _id, replies, text,
                          } = thread;
                          return {
                            bumped_on,
                            created_on,
                            _id,
                            replies: replies.reverse().slice(0, 3),
                            replycount: replies.length,
                            text,
                          };
                        });
          return res.send(threads);
          
        })
        .catch(err => console.log('Error : ' + err));
      })
    });
    
  app.route('/api/replies/:board')
    .post((req, res) => {
      let { board } = req.params;
      let { delete_password, thread_id, text } = req.body;
    
      connectToDb()
      .then(dbCon => {
        let db = dbCon.db('message-board');
        let _id = new objectId();
        var created_on = new Date();
        var bumped_on = created_on;
        var reported = false;
        var reply = {
          created_on, delete_password, _id, reported, text,
        };
        db.collection('boards').findOneAndUpdate(
          { board, 'threads._id': objectId(thread_id) },
          { $push: {'threads.$.replies': reply}}
        )
        .then(() => res.redirect(`/b/${board}/${thread_id}`))
        .catch(err => console.log('Error : ' + err));
      })
      .catch(err => console.log('Error : ' + err));
    })
  
    .put((req, res) => {
      var { board } = req.params;
      var { reply_id, thread_id } = req.body;
      connectToDb()
        .then((client) => {
          var db = client.db('message-board');
          db.collection('boards').updateOne(
            { board },
            { $set: { 'threads.$[thread].replies.$[reply].reported': true } },
            { arrayFilters: [
              { 'thread._id': objectId(thread_id) },
              { 'reply._id': objectId(reply_id) },
            ]},
          )
          .then((doc) => (doc.result.nModified === 0)
            ? res.send('reply id or thread id not found')
            : res.send('success')
          )
          .catch((err) => console.log('Error : ' + err));
        })
    })
  
    .get((req, res) => {
      let { board } = req.params;
      let { thread_id } = req.query;
    
      connectToDb()
        .then((client) => {
          var db = client.db('message-board');
          db.collection('boards').findOne({board})
            .then(board => {
              let thread = board.threads.find(thread => String(thread._id) === thread_id);
              console.log(board);
              let { bumped_on, created_on, _id, replies, text } = thread;
              return res.json({
                bumped_on, created_on, _id, replies, replycount: replies.length, text,
              });
            })
            .catch((err) => console.log('Error : ' + err));
        })
        .catch((err) => console.log('Error : ' + err));
    })
  
    .delete((req, res) => {
      let { board } = req.params;
      let { delete_password, reply_id, thread_id } = req.body;
      connectToDb()
        .then((client) => {
          let db = client.db('message-board');
          db.collection('boards').updateOne(
            { board },
            { $set: { 'threads.$[thread].replies.$[reply].text': '[deleted]' } },
            { arrayFilters: [
              { 'thread._id': objectId(thread_id) },
              {
                'reply.delete_password': delete_password,
                'reply._id': objectId(reply_id),
              }
            ]},
          )
          .then((doc) => (doc.result.nModified === 0)
            ? res.send('incorrect password')
            : res.send('success'))
          .catch((err) => console.log('Error : ' + err));
        })
    })
};
