import { GraphQLNamedType, GraphQLSchema } from 'graphql'
import { Transform } from 'graphql-tools'

export class PrismaTransform implements Transform {
  private filter: (type: GraphQLNamedType) => boolean

  constructor() {
    // this.filter = filter
  }

  public transformSchema(schema: GraphQLSchema): GraphQLSchema {
    console.log(schema)
    console.log(schema.getTypeMap().Query)
    console.log(schema.getTypeMap().ObjectWhereInput)

    return schema
  }
}
