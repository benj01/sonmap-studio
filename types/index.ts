export type Message = {
    success?: string;
    error?: string;
    message?: string;
};

export type ActionSuccessResponse<T = unknown> = {
    kind: "success";
    success: true;
    message: string;
    data?: T;
};

export type ActionErrorResponse = {
    kind: "error";
    error: string;
    code?: string;
};

export type ActionResponse<T = unknown> =
    | ActionSuccessResponse<T>
    | ActionErrorResponse;
