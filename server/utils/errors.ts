// Domain errors thrown by the service layer. Services stay HTTP-agnostic by
// throwing these; the createError() call still produces a proper H3 error so
// route handlers don't need to translate anything. If you ever move a service
// out of Nitro, swap these for plain Error subclasses.

export function notFound(resource: string) {
    return createError({ statusCode: 404, statusMessage: `${resource} not found` })
}

export function conflict(message: string) {
    return createError({ statusCode: 409, statusMessage: message })
}
