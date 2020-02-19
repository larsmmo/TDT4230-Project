#version 430 core

// A simple pass-through geometry shader. Only implemented for testing.

layout (triangles) in;
layout (triangle_strip, max_vertices = 3) out;

in VS_OUT {
	vec3 normal;
	vec2 textureCoordinates;
	vec3 fragPos;
	vec3 position;
} gs_in[];

out GS_OUT {
	vec3 normal;
	vec2 textureCoordinates;
	vec3 fragPos;
	vec3 position;
} gs_out;

void main()
{
	for (int i = 0; i < 3; i++){
		gs_out.normal = normalize(gs_in[i].normal);
		gs_out.textureCoordinates = gs_in[i].textureCoordinates;
		gs_out.fragPos = gs_in[i].fragPos;
		gl_Position = gl_in[i].gl_Position;
		gs_out.position = gs_in[i].position;
		EmitVertex();
	}

	EndPrimitive();
}