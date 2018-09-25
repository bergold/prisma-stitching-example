import { GraphQLNamedType, GraphQLSchema } from 'graphql'
import { mergeSchemas } from 'graphql-tools'
import { getQuerySingle } from './util'

export interface Options {
  schemas: GraphQLSchema[]
  stitches: Stitch[]
  hideStitchFields?: Boolean
}

export enum RelationKind {
  MANY,
  ONE,
}

export interface Stitch {
  type: string
  field: string
  /**
   * Name of the field from the Type that should be used for connecting
   * the remote type.
   * If no value is provided, `field + 'id'` is assumend.
   */
  fromField?: string
  /**
   * ...
   */
  relation: StitchRelation
}

export interface StitchRelation {
  /**
   * Default: ONE
   */
  kind?: RelationKind
  /**
   * Delegates to the given schema.
   * Uses `query` as root field and `filter` as the field
   * for the `<Type>WhereInput`
   */
  schema: GraphQLSchema
  type: string
  /**
   * Default is `'id'`
   */
  field?: string
}

export default function opencrudMerge(options: Options) {
  const { schemas, stitches } = options

  /**
   * Steps that need to be taken:
   *
   * merge schemas
   * extend types that have stitches
   * add resolvers for the new field
   * wrap resolvers for all fields that accept
   *   a <Field>WhereInput for stiched types
   */

  const resolvers = {}
  stitches
    .map(stitch => ({
      ...stitch,
      fromField: stitch.fromField || stitch.field + '_id',
      relation: {
        ...stitch.relation,
        kind: stitch.relation.kind || RelationKind.ONE,
        field: stitch.relation.field || 'id',
      },
    }))
    .forEach(stitch => {
      // isOpenCRUDType(stitch.type, merged)

      resolvers[stitch.type] = resolvers[stitch.type] || {}
      resolvers[stitch.type][stitch.field] = {
        fragment: `... on ${stitch.type} { ${stitch.fromField} }`,
        resolve: (parent, _, context, info) => {
          return info.mergeInfo.delegateToSchema({
            schema: stitch.relation.schema,
            operation: 'query',
            fieldName: getQuerySingle(stitch.relation.type),
            args: {
              where: {
                [stitch.relation.field]: parent[stitch.fromField],
              },
            },
            context,
            info,
          })
        },
      }
    })

  const merged = mergeSchemas({
    schemas: (schemas as (string | GraphQLSchema | GraphQLNamedType[])[]).concat(
      getExtensionDefinitions(stitches)
    ),
    resolvers,
  })

  // const extended = extendSchema(merged, {
  //   kind: Kind.DOCUMENT,
  //   definitions: [],
  // })

  return merged
}

function getExtensionDefinitions(stiches: Stitch[]): string {
  const inputTemplate = ({ relation: { type } }) => `(
    where: ${type}WhereInput
    orderBy: ${type}OrderByInput
    skip: Int
    after: String
    before: String
    first: Int
    last: Int
  )`

  const relationTypeTemplate = ({ relation: { kind = RelationKind.ONE, type } }) =>
    kind === RelationKind.ONE ? `${type}!` : `[${type}!]!`

  const extensionTemplate = (stitch: Stitch) => `
    extend type ${stitch.type} {
      ${stitch.field}${
    stitch.relation.kind === RelationKind.MANY ? inputTemplate(stitch) : ''
  }: ${relationTypeTemplate(stitch)}
    }
  `

  return stiches.map(extensionTemplate).join('\n')
}
