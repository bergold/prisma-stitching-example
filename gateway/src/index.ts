import { HttpLink } from 'apollo-link-http'
import * as fs from 'fs'
import { GraphQLNamedType, GraphQLSchema } from 'graphql'
import { makeRemoteExecutableSchema, mergeSchemas } from 'graphql-tools'
import { GraphQLServer } from 'graphql-yoga'
import * as merge from 'lodash.merge'
import fetch from 'node-fetch'

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

  const linkTypeDefs = `
    extend type Query {
      test(a: AInput): String
    }

    input AInput {
      b: Int
    }
    extend input AInput {
      x: String
    }

    extend type User {
      objects(
        where: ObjectWhereInput
        orderBy: ObjectOrderByInput
        skip: Int
        after: String
        before: String
        first: Int
        last: Int
      ): [Object!]
    }

    extend type Object {
      owner: User!
    }

    extend input ObjectWhereInput {
      owner: String
    }

    extend type Query {
      objects2(
        where: ObjectWhereInput
        orderBy: ObjectOrderByInput
        skip: Int
        after: String
        before: String
        first: Int
        last: Int
      ): [Object!]
    }
  `

  const linkResolvers = {
    User: {
      objects: {
        fragment: `... on User { id }`,
        resolve(user, args, context, info) {
          return info.mergeInfo.delegateToSchema({
            schema: objectserviceSchema,
            operation: 'query',
            fieldName: 'objects',
            args: merge({}, args, {
              where: {
                owner_id: user.id,
              },
            }),
            context,
            info,
          })
        },
      },
    },

    Object: {
      owner: {
        fragment: `... on Object { owner_id }`,
        resolve(object, args, context, info) {
          return info.mergeInfo.delegateToSchema({
            schema: userserviceSchema,
            operation: 'query',
            fieldName: 'user',
            args: merge({}, args, {
              where: {
                id: object.owner_id,
              },
            }),
            context,
            info,
          })
        },
      },
    },
  }

  const schema = mergeSchemas({
    schemas: (serviceschemas as (string | GraphQLSchema | GraphQLNamedType[])[]).concat([
      linkTypeDefs,
    ]),
    resolvers: linkResolvers,
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
