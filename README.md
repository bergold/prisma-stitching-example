# prisma-stitching-example

## example queries

```
query {
  users {
    id,
    name,
    objects(where: { title_starts_with: "Ta" }) {
      id,
      title,
      owner_id
    }
  }
}
```