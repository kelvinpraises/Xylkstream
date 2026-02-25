declare module '*.json' {
  interface ContractArtifact {
    contractName: string;
    abi: any[];
    bytecode: string;
  }
  const value: ContractArtifact;
  export default value;
}
