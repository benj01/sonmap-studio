export type ApiResponse<T = void> = {
  success: boolean;
  data?: T;
  error?: string;
  code?: string;
  message?: string;
};

export type ErrorResponse = {
  error: string;
  code?: string;
};

export type SuccessResponse<T = void> = {
  success: true;
  message: string;
  data?: T;
};

export type ActionResponse<T = void> = {
  kind: "success" | "error";
  message: string;
  error?: string;
  code?: string;
  data?: T;
};
