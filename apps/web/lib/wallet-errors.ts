import {
  BaseError,
  ContractFunctionRevertedError,
  InsufficientFundsError,
  UserRejectedRequestError,
} from "viem";

export function isUserRejection(error: unknown) {
  return (
    error instanceof BaseError &&
    error.walk((cause) => cause instanceof UserRejectedRequestError) instanceof
      UserRejectedRequestError
  );
}

export function isInsufficientGas(error: unknown) {
  return (
    error instanceof BaseError &&
    error.walk((cause) => cause instanceof InsufficientFundsError) instanceof
      InsufficientFundsError
  );
}

export function revertName(error: unknown) {
  if (!(error instanceof BaseError)) return undefined;
  const reverted = error.walk((cause) => cause instanceof ContractFunctionRevertedError);
  return reverted instanceof ContractFunctionRevertedError
    ? reverted.data?.errorName
    : undefined;
}
