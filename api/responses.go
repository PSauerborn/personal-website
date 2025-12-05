package main

import "github.com/gin-gonic/gin"

var (
	// 400 Bad Request
	BadRequestPayload = gin.H{"error": "Bad Request"}

	BadRequestResponse = RESTResponse{
		Code:    400,
		Payload: BadRequestPayload,
	}

	// 403 Forbidden
	ForbiddenPayload = gin.H{"error": "Forbidden"}

	ForbiddenResponse = RESTResponse{
		Code:    403,
		Payload: ForbiddenPayload,
	}

	// 500 Internal Server Error
	InternalServerErrorPayload = gin.H{"error": "Internal Server Error"}

	InternalServerErrorResponse = RESTResponse{
		Code:    500,
		Payload: InternalServerErrorPayload,
	}

	// 501 Not Implemented
	NotImplementedPayload = gin.H{"error": "Not Implemented"}

	NotImplementedResponse = RESTResponse{
		Code:    501,
		Payload: NotImplementedPayload,
	}
)
