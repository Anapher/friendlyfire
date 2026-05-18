import { domainError } from "./errors";

export type Cents = number;
export type Quantity = number;

export function cents(value: number): Cents {
  if (!Number.isInteger(value)) {
    throw domainError("INVALID_MONEY", "Money amounts must be integer cents");
  }
  return value;
}

export function assertCentPrice(value: number): Cents {
  if (!Number.isInteger(value) || value < 1 || value > 99) {
    throw domainError("INVALID_PRICE", "Price must be between 1 and 99 cents");
  }
  return value;
}

export function assertPositiveQuantity(value: number): Quantity {
  if (!Number.isInteger(value) || value <= 0) {
    throw domainError("INVALID_QUANTITY", "Quantity must be a positive integer");
  }
  return value;
}
