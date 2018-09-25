import { HttpLink } from 'apollo-link-http'
import * as fs from 'fs'
import { GraphQLSchema, SelectionSetNode } from 'graphql'
import {
  FilterRootFields,
  FilterTypes,
  makeRemoteExecutableSchema,
  mergeSchemas,
  transformSchema,
  WrapQuery,
} from 'graphql-tools'
import { GraphQLServer } from 'graphql-yoga'
import * as merge from 'lodash.merge'
import fetch from 'node-fetch'
import { PrismaTransform } from './transforms'

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

  const transformedUserserviceSchema = transformSchema(userserviceSchema, [
    new FilterRootFields((_, fieldName) => fieldName != 'node'),
  ])

  const transformedObjectserviceSchema = transformSchema(objectserviceSchema, [
    new FilterRootFields((_, fieldName) => fieldName != 'node'),
    new FilterTypes(type => {
      // console.log(type.name)
      return true
    }),
    // new PrismaTransform(),
  ])

  const linkTypeDefs = `
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
      owner: UserWhereInput
    }
  `

  const linkResolvers = {
    Query: {
      objects: {
        async resolve(parent, args, context, info) {
          const new_args = merge({}, args)
          delete new_args.where.owner

          // Resolve UserWhereInput to User IDs
          if (args.where && args.where.owner) {
            new_args.where.owner_id_in = await info.mergeInfo
              .delegateToSchema({
                schema: userserviceSchema,
                operation: 'query',
                fieldName: 'users',
                args: {
                  where: args.where.owner,
                },
                context,
                info,
                transforms: transformedUserserviceSchema.transforms,
              })
              .then(res => res.map(user => user.id))
          }

          return info.mergeInfo.delegateToSchema({
            schema: objectserviceSchema,
            operation: 'query',
            fieldName: 'objects',
            args: new_args,
            context,
            info,
            transforms: transformedObjectserviceSchema.transforms,
          })
        },
      },
    },

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
            transforms: transformedObjectserviceSchema.transforms,
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
            transforms: transformedUserserviceSchema.transforms,
          })
        },
      },
    },

    // ObjectWhereInput: {
    //   owner: {
    //     resolve(parent, args, context, into) {
    //       console.log('hit resolver')
    //     },
    //   },
    // },
  }

  const schema = transformSchema(
    mergeSchemas({
      schemas: [transformedUserserviceSchema, transformedObjectserviceSchema, linkTypeDefs],
      resolvers: linkResolvers,
    }),
    [
      new PrismaTransform(),
      new WrapQuery(
        // path at which to apply wrapping and extracting
        ['objects'],
        (subtree: SelectionSetNode) => {
          console.log('wrap', subtree)
          return subtree
        },
        // (subtree: SelectionSetNode) => ({
        //   // we create a wrapping AST Field
        //   kind: Kind.FIELD,
        //   name: {
        //     kind: Kind.NAME,
        //     // that field is `address`
        //     value: 'address',
        //   },
        //   // Inside the field selection
        //   selectionSet: subtree,
        // }),
        // how to process the data result at path
        result => {
          console.log('extract', result)
          return result
        }
      ),
    ]
  )

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
