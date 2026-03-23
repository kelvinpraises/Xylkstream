import {
  KyselyPlugin,
  PluginTransformQueryArgs,
  PluginTransformResultArgs,
  QueryResult,
  RootOperationNode,
  UnknownRow,
} from "kysely";

export class SQLiteJSONPlugin implements KyselyPlugin {
  transformQuery(args: PluginTransformQueryArgs): RootOperationNode {
    const transformed = this.transformNode(args.node);
    return transformed as RootOperationNode;
  }

  async transformResult(
    args: PluginTransformResultArgs
  ): Promise<QueryResult<UnknownRow>> {
    return args.result;
  }

  private transformNode(node: any): any {
    if (!node || typeof node !== "object") {
      return node;
    }

    if (node.kind === "ValueNode") {
      const value = node.value;
      if (this.shouldStringify(value)) {
        return { ...node, value: JSON.stringify(value) };
      }
      return node;
    }

    if (node.kind === "PrimitiveValueListNode" && Array.isArray(node.values)) {
      const transformedValues = node.values.map((value: any) => {
        if (this.shouldStringify(value)) {
          return JSON.stringify(value);
        }
        return value;
      });
      return { ...node, values: transformedValues };
    }

    if (Array.isArray(node)) {
      return node.map((item) => this.transformNode(item));
    }

    const transformed: any = {};
    for (const key in node) {
      if (Object.prototype.hasOwnProperty.call(node, key)) {
        transformed[key] = this.transformNode(node[key]);
      }
    }
    return transformed;
  }

  private shouldStringify(value: unknown): boolean {
    return (
      value !== null &&
      value !== undefined &&
      typeof value === "object" &&
      !(value instanceof Date) &&
      !(value instanceof Buffer)
    );
  }
}
