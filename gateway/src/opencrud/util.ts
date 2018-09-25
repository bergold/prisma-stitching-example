import { GraphQLSchema } from 'graphql'

/**
 * Returns true if the Type exists in the schema and
 * has all OpenCRUD Operations available.
 */
export const isOpenCRUDType = (type: string, schema: GraphQLSchema) => !!schema.getType(type)

export const getQuerySingle = (type: string) => type.toLowerCase()
export const getQueryMany = (type: string) => type.toLowerCase() + 's'
export const getQueryConnection = (type: string) => type.toLowerCase() + 'Connection'
