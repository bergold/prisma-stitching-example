import { HttpLink } from 'apollo-link-http'
import * as fs from 'fs'
import { GraphQLSchema } from 'graphql'
import { makeRemoteExecutableSchema } from 'graphql-tools'
import { GraphQLServer } from 'graphql-yoga'
import fetch from 'node-fetch'
import opencrudMerge, { RelationKind } from './opencrud'

// Config --------------------------------------------------------------------------------------

const config = {
  port: parseInt(process.env.PORT || '4000', 10),
  userservice: {
    endpoint: 'https://eu1.prisma.sh/emil-bergold/prisma-stitching-example-userservice/dev',
    schemaPath: './schemas/userservice.graphql',
  },
  objectservice: {
    endpoint: 'https://eu1.prisma.sh/emil-bergold/prisma-stitching-example-objectservice/dev',
    schemaPath: './schemas/objectservice.graphql',
  },
}

// Remote Schemas ------------------------------------------------------------------------------

const remoteSchemaFactory = config =>
  new Promise<GraphQLSchema>((resolve, reject) => {
    fs.readFile(config.schemaPath, 'utf-8', (err, data) => {
      if (err) return reject(err)

      resolve(
        makeRemoteExecutableSchema({
          schema: data,
          link: new HttpLink({ uri: config.endpoint, fetch }),
        })
      )
    })
  })

const userserviceSchemaPromise = remoteSchemaFactory(config.userservice)
const objectserviceSchemaPromise = remoteSchemaFactory(config.objectservice)

// Schema manipulations ------------------------------------------------------------------------

Promise.all([userserviceSchemaPromise, objectserviceSchemaPromise]).then(serviceschemas => {
  const userserviceSchema = serviceschemas[0]
  const objectserviceSchema = serviceschemas[1]

  // Object.owner: owner_id -> userSchema.user(id)

  // User.objects: id -> objectSchema.objects(owner_id)

  // User.friends: friendIds -> userSchema.users(id)

  const schema = opencrudMerge({
    schemas: [userserviceSchema, objectserviceSchema],
    stitches: [
      {
        type: 'Object',
        field: 'owner',
        // fromField: 'owner_id',
        relation: {
          // kind: RelationKind.ONE,
          schema: userserviceSchema,
          type: 'User',
          // field: 'id'
        },
        // reverseRelation: {
        //   schema: objectserviceSchema,
        //   ...
        // }
      },
      {
        type: 'User',
        field: 'objects',
        fromField: 'id',
        relation: {
          kind: RelationKind.MANY,
          schema: objectserviceSchema,
          type: 'Object',
          field: 'owner_id',
        },
      },
    ],
  })
  // Server --------------------------------------------------------------------------------------

  new GraphQLServer({
    schema,
  })
    .start()
    .then(() => {
      console.log(`> Server started on localhost:4000`)
    })
    .catch(err => {
      console.error(err)
    })
})
